const { detectSpam }                 = require('./spamDetector');
const { analyzeComment }             = require('./aiAnalyzer');
const blacklist                      = require('../services/blacklist');
const facebookApi                    = require('../services/facebookApi');
const { setState, getState, STATES } = require('../services/stateTracker');
const { checkRateLimit }             = require('../services/rateLimiter');

async function processEvent(event, kafkaProducer) {
  const { eventId, senderId, content, metadata } = event;
  const userId    = senderId;
  const message   = content || '';
  const commentId = metadata?.commentId;
  const postId    = metadata?.postId;

  // idempotency: bỏ qua nếu event đã được xử lý xong trước đó
  const existing = await getState(eventId);
  if (existing) {
    const done = [STATES.PROCESSED, STATES.HIDDEN, STATES.REPLIED, STATES.PENDING_REVIEW];
    if (done.includes(existing.state)) {
      console.log(`[Decision] ${eventId} already "${existing.state}", skip`);
      return;
    }
  }

  await setState(eventId, STATES.PROCESSING);

  try {
    // 1. blacklist
    if (userId && await blacklist.isBlacklisted(userId)) {
      await setState(eventId, STATES.HIDDEN, { reason: 'blacklisted' });
      return;
    }

    // 2. rate limit — hành vi bất thường, không tự động xử lý
    const rateCheck = await checkRateLimit(userId);
    if (rateCheck.limited) {
      console.warn(`[Decision] ${userId} rate limited (${rateCheck.count} req) → pending_review`);
      await setState(eventId, STATES.PENDING_REVIEW, { reason: 'rate_limited', reqCount: rateCheck.count });
      await kafkaProducer.send({
        topic: 'pending_review',
        messages: [{ value: JSON.stringify({ event, reason: 'rate_limited', reqCount: rateCheck.count, timestamp: Date.now() }) }],
      });
      return;
    }

    // 3. spam detection
    const spamResult = detectSpam(message);

    if (spamResult.spamLevel === 'heavy') {
      await facebookApi.hideComment(commentId);
      await kafkaProducer.send({
        topic: 'manual_review_queue',
        messages: [{ value: JSON.stringify({ event, reason: spamResult.reasons }) }],
      });
      await setState(eventId, STATES.HIDDEN, { spamLevel: 'heavy', reasons: spamResult.reasons });
      return;
    }

    if (spamResult.spamLevel === 'light') {
      const spamCount = await blacklist.incrementSpamCount(userId);
      await facebookApi.hideComment(commentId);

      if (spamCount >= 3) {
        // đủ 3 lần trong 24h → blacklist
        await blacklist.addToBlacklist(userId, 'spam_repeat_3_times');
        await setState(eventId, STATES.HIDDEN, { reason: 'spam_blacklisted', spamCount });
        console.log(`[Decision] ${userId} blacklisted after ${spamCount} spam`);
      } else {
        await setState(eventId, STATES.HIDDEN, { spamLevel: 'light', spamCount });
      }
      return;
    }

    // 4. AI analysis
    const aiResult = await analyzeComment(message);
    await setState(eventId, STATES.PROCESSED, { spamResult, aiResult });

    await kafkaProducer.send({
      topic: 'processed_events',
      messages: [{ value: JSON.stringify({
        eventId, userId, commentId, message, postId,
        analysis: { spam: spamResult, ai: aiResult },
        timestamp: Date.now(),
      }) }],
    });

    console.log(`[Decision] ${eventId}: intent=${aiResult.intent} sentiment=${aiResult.sentiment} src=${aiResult.source}`);

  } catch (err) {
    console.error(`[Decision] failed ${eventId}:`, err.message);
    await setState(eventId, STATES.FAILED, { error: err.message });

    // đẩy sang retry service
    await kafkaProducer.send({
      topic: 'send_failed',
      messages: [{ value: JSON.stringify({ event, error: err.message, retryCount: 0, timestamp: Date.now() }) }],
    });
  }
}

module.exports = { processEvent };