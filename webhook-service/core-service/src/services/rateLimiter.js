// Rate Limiter dùng Redis
// Giới hạn: mỗi userId tối đa RATE_LIMIT_MAX request trong RATE_LIMIT_WINDOW giây
const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379');

const RATE_LIMIT_MAX    = parseInt(process.env.RATE_LIMIT_MAX    || '20'); // 20 bình luận
const RATE_LIMIT_WINDOW = parseInt(process.env.RATE_LIMIT_WINDOW || '60'); // trong 60 giây

/**
 * Kiểm tra rate limit cho userId.
 * Trả về { limited: bool, count: number }
 * Nếu limited=true → hệ thống nên chuyển sang pending_review
 */
async function checkRateLimit(userId) {
  if (!userId) return { limited: false, count: 0 };

  const key   = `rate:${userId}`;
  const count = await redis.incr(key);

  // Đặt TTL khi tạo lần đầu trong window
  if (count === 1) {
    await redis.expire(key, RATE_LIMIT_WINDOW);
  }

  const limited = count > RATE_LIMIT_MAX;

  if (limited) {
    console.warn(`[RateLimiter] User ${userId} đã gửi ${count} req/${RATE_LIMIT_WINDOW}s → RATE LIMITED`);
  }

  return { limited, count };
}

/**
 * Lấy số request hiện tại trong window (không increment)
 */
async function getRateCount(userId) {
  const count = await redis.get(`rate:${userId}`);
  return parseInt(count) || 0;
}

/**
 * Reset thủ công rate count của userId (dùng cho admin)
 */
async function resetRateLimit(userId) {
  await redis.del(`rate:${userId}`);
}

module.exports = { checkRateLimit, getRateCount, resetRateLimit };
