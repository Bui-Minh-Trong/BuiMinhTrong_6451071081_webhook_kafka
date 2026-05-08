const { detectSpam } = require('./spamDetector');
const { analyzeComment } = require('./aiAnalyzer');
const blacklist = require('../services/blacklist');
const facebookApi = require('../services/facebookApi');
const { setState, STATES } = require('../services/stateTracker');

async function processEvent(event, kafkaProducer) {
  //  dùng đúng field names từ normalizer.js
  const { eventId, senderId, content, metadata } = event;
  const userId = senderId;
  const message = content || '';
  const commentId = metadata?.commentId;
  const postId = metadata?.postId;

  await setState(eventId, STATES.PROCESSING);

  try {
    //  Kiểm tra blacklist 
    if (userId && await blacklist.isBlacklisted(userId)) {
      console.log(`[Decision] User ${userId} is blacklisted. Skipping.`);
      await setState(eventId, STATES.HIDDEN, { reason: 'blacklisted' });
      return;
    }

    // Phát hiện spam 
    //truyền message string trực tiếp, không truyền cả event object
    const spamResult = detectSpam(message);

    if (spamResult.spamLevel === 'heavy') {
      await facebookApi.hideComment(commentId);
      await kafkaProducer.send({
        topic: 'manual_review_queue',
        messages: [{ value: JSON.stringify({ event, reason: spamResult.reasons }) }]
      });
      await setState(eventId, STATES.HIDDEN, { spamLevel: 'heavy', reasons: spamResult.reasons });
      return;
    }

    if (spamResult.spamLevel === 'light') {
      const spamCount = await blacklist.incrementSpamCount(userId);

      if (spamCount >= 3) {
        await blacklist.addToBlacklist(userId, 'spam_repeat_3_times');
        await facebookApi.hideComment(commentId);
        await setState(eventId, STATES.HIDDEN, { reason: 'spam_blacklisted' });
        return;
      } else {
        await facebookApi.hideComment(commentId);
        await setState(eventId, STATES.HIDDEN, { spamLevel: 'light', spamCount });
        return;
      }
    }

    // Phân tích AI 
    const aiResult = await analyzeComment(message);
    await setState(eventId, STATES.PROCESSED, { spamResult, aiResult });

    // Publish kết quả 
    await kafkaProducer.send({
      topic: 'processed_events',
      messages: [{
        value: JSON.stringify({
          eventId, userId, commentId, message, postId,
          analysis: { spam: spamResult, ai: aiResult },
          timestamp: Date.now(),
        })
      }]
    });

    console.log(`[Decision] Event ${eventId}: intent=${aiResult.intent}, sentiment=${aiResult.sentiment}`);

  } catch (err) {
    console.error(`[Decision] Error processing ${eventId}:`, err.message);
    await setState(eventId, STATES.FAILED, { error: err.message });

    await kafkaProducer.send({
      topic: 'send_failed',
      messages: [{
        value: JSON.stringify({
          event, error: err.message, retryCount: 0, timestamp: Date.now()
        })
      }]
    });
  }
}

module.exports = { processEvent };