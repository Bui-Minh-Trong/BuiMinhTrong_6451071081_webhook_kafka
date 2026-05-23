// Circuit Breaker cho Facebook API
// Trạng thái: closed → open → half-open → closed
// Khi 10 request liên tiếp thất bại → open (chặn gọi)
// Sau OPEN_DURATION giây → half-open (thử lại 1 lần)
// Nếu thành công → đóng lại; nếu thất bại → open lại
const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379');

const FAILURE_THRESHOLD = parseInt(process.env.CB_FAILURE_THRESHOLD || '10'); // 10 lỗi liên tiếp
const OPEN_DURATION     = parseInt(process.env.CB_OPEN_DURATION     || '30'); // 30 giây chặn
const CB_KEY            = 'circuit_breaker:facebook_api';

/**
 * Lấy trạng thái hiện tại của circuit breaker
 */
async function getState() {
  const data = await redis.hgetall(CB_KEY);
  if (!data || !data.state) return { state: 'closed', failures: 0, openedAt: 0 };
  return {
    state:    data.state,
    failures: parseInt(data.failures) || 0,
    openedAt: parseInt(data.openedAt) || 0,
  };
}

/**
 * Ghi nhận call thành công → reset failures về 0, đóng circuit
 */
async function recordSuccess() {
  await redis.hset(CB_KEY, 'failures', 0, 'state', 'closed');
}

/**
 * Ghi nhận call thất bại → tăng failures
 * Nếu failures >= FAILURE_THRESHOLD → mở circuit
 */
async function recordFailure() {
  const failures = await redis.hincrby(CB_KEY, 'failures', 1);
  if (failures >= FAILURE_THRESHOLD) {
    await redis.hset(CB_KEY, 'state', 'open', 'openedAt', String(Date.now()));
    console.warn(`[CircuitBreaker] OPEN sau ${failures} lỗi liên tiếp — chặn gọi Facebook API ${OPEN_DURATION}s`);
  }
  return failures;
}

/**
 * Kiểm tra circuit có đang mở không.
 * Tự chuyển sang half-open nếu đã qua OPEN_DURATION.
 */
async function isOpen() {
  const { state, openedAt } = await getState();
  if (state !== 'open') return false;

  const elapsedSec = (Date.now() - openedAt) / 1000;
  if (elapsedSec > OPEN_DURATION) {
    // Chuyển sang half-open để thử lại
    await redis.hset(CB_KEY, 'state', 'half-open');
    console.log('[CircuitBreaker] Chuyển sang HALF-OPEN — đang thử lại...');
    return false;
  }

  return true;
}

/**
 * Wrap một async function với circuit breaker.
 * Ném lỗi ngay nếu circuit đang OPEN.
 */
async function wrap(fn) {
  if (await isOpen()) {
    throw new Error('[CircuitBreaker] OPEN — Facebook API tạm không khả dụng. Vui lòng thử lại sau.');
  }

  try {
    const result = await fn();
    await recordSuccess();
    return result;
  } catch (err) {
    await recordFailure();
    throw err;
  }
}

module.exports = { wrap, isOpen, getState, recordSuccess, recordFailure };
