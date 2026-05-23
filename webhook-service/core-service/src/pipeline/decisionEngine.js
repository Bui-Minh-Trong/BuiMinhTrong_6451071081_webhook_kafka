// Decision Engine — điều phối toàn bộ pipeline xử lý event
// Thứ tự: Idempotency → Blacklist → Rate Limit → Spam → AI → Action
const { detectSpam }                     = require('./spamDetector');
const { analyzeComment }                 = require('./aiAnalyzer');
const blacklist                          = require('../services/blacklist');
const facebookApi                        = require('../services/facebookApi');
const { setState, getState, STATES }     = require('../services/stateTracker');
const { checkRateLimit }                 = require('../services/rateLimiter');

async function processEvent(event, kafkaProducer) {
  const { eventId, senderId, content, metadata } = event;
  const userId    = senderId;
  const message   = content || '';
  const commentId = metadata?.commentId;
  const postId    = metadata?.postId;

  // ════════════════════════════════════════════════════
  // BƯỚC 0: IDEMPOTENCY — tránh xử lý trùng event
  // Nếu event đã ở trạng thái kết thúc (processed/hidden/replied)
  // thì bỏ qua, tránh thực hiện lại hành động (ví dụ: ẩn comment 2 lần)
  // ════════════════════════════════════════════════════
  const existingState = await getState(eventId);
  if (existingState) {
    const terminalStates = [STATES.PROCESSED, STATES.HIDDEN, STATES.REPLIED, STATES.PENDING_REVIEW];
    if (terminalStates.includes(existingState.state)) {
      console.log(
        `[Decision] Idempotency: Event ${eventId} đã ở trạng thái "${existingState.state}" → bỏ qua`
      );
      return;
    }
  }

  // Đánh dấu đang xử lý
  await setState(eventId, STATES.PROCESSING);

  try {
    // ════════════════════════════════════════════════════
    // BƯỚC 1: BLACKLIST — bỏ qua hoàn toàn user vi phạm
    // ════════════════════════════════════════════════════
    if (userId && (await blacklist.isBlacklisted(userId))) {
      console.log(`[Decision] User ${userId} trong blacklist → bỏ qua`);
      await setState(eventId, STATES.HIDDEN, { reason: 'blacklisted' });
      return;
    }

    // ════════════════════════════════════════════════════
    // BƯỚC 2: RATE LIMITING — phát hiện hành vi bất thường
    // Nếu user gửi quá nhiều bình luận trong thời gian ngắn
    // → chuyển sang pending_review, không xử lý tự động
    // ════════════════════════════════════════════════════
    const rateCheck = await checkRateLimit(userId);
    if (rateCheck.limited) {
      console.warn(
        `[Decision] User ${userId} bị rate limit (${rateCheck.count} req) → pending_review`
      );
      await setState(eventId, STATES.PENDING_REVIEW, {
        reason:    'rate_limited',
        reqCount:  rateCheck.count,
      });
      // Publish sang hàng chờ để admin xem xét
      await kafkaProducer.send({
        topic: 'pending_review',
        messages: [
          {
            value: JSON.stringify({
              event,
              reason:   'rate_limited',
              reqCount: rateCheck.count,
              timestamp: Date.now(),
            }),
          },
        ],
      });
      return;
    }

    // ════════════════════════════════════════════════════
    // BƯỚC 3: SPAM DETECTION
    // ════════════════════════════════════════════════════
    const spamResult = detectSpam(message);

    if (spamResult.spamLevel === 'heavy') {
      // Spam nặng (link scam/bot rõ ràng) → ẩn ngay + đưa vào hàng review thủ công
      await facebookApi.hideComment(commentId);
      await kafkaProducer.send({
        topic: 'manual_review_queue',
        messages: [{ value: JSON.stringify({ event, reason: spamResult.reasons }) }],
      });
      await setState(eventId, STATES.HIDDEN, { spamLevel: 'heavy', reasons: spamResult.reasons });
      return;
    }

    if (spamResult.spamLevel === 'light') {
      // Spam nhẹ → ẩn ngay, đếm lần vi phạm
      const spamCount = await blacklist.incrementSpamCount(userId);

      if (spamCount >= 3) {
        // Vi phạm 3 lần trong 24h → blacklist nội bộ
        await blacklist.addToBlacklist(userId, 'spam_repeat_3_times');
        await facebookApi.hideComment(commentId);
        await setState(eventId, STATES.HIDDEN, { reason: 'spam_blacklisted', spamCount });
        console.log(`[Decision] User ${userId} bị blacklist sau ${spamCount} lần spam`);
      } else {
        // Chưa đủ 3 lần → chỉ ẩn comment
        await facebookApi.hideComment(commentId);
        await setState(eventId, STATES.HIDDEN, { spamLevel: 'light', spamCount });
      }
      return;
    }

    // ════════════════════════════════════════════════════
    // BƯỚC 4: AI ANALYSIS — phân loại intent & sentiment
    // ════════════════════════════════════════════════════
    const aiResult = await analyzeComment(message);
    await setState(eventId, STATES.PROCESSED, { spamResult, aiResult });

    // Publish kết quả đã xử lý để các service downstream sử dụng
    await kafkaProducer.send({
      topic: 'processed_events',
      messages: [
        {
          value: JSON.stringify({
            eventId, userId, commentId, message, postId,
            analysis: { spam: spamResult, ai: aiResult },
            timestamp: Date.now(),
          }),
        },
      ],
    });

    console.log(
      `[Decision] Event ${eventId}: intent=${aiResult.intent}, sentiment=${aiResult.sentiment}, source=${aiResult.source}`
    );

  } catch (err) {
    console.error(`[Decision] Lỗi khi xử lý ${eventId}:`, err.message);
    await setState(eventId, STATES.FAILED, { error: err.message });

    // Publish sang send_failed để Retry Service xử lý lại
    await kafkaProducer.send({
      topic: 'send_failed',
      messages: [
        {
          value: JSON.stringify({
            event,
            error:      err.message,
            retryCount: 0,
            timestamp:  Date.now(),
          }),
        },
      ],
    });
  }
}

module.exports = { processEvent };