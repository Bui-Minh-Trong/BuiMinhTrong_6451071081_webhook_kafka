const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379');

const RATE_LIMIT_MAX    = parseInt(process.env.RATE_LIMIT_MAX    || '20');
const RATE_LIMIT_WINDOW = parseInt(process.env.RATE_LIMIT_WINDOW || '60'); // giây

async function checkRateLimit(userId) {
  if (!userId) return { limited: false, count: 0 };

  const key   = `rate:${userId}`;
  const count = await redis.incr(key);

  // chỉ set TTL lần đầu để tránh reset window mỗi lần incr
  if (count === 1) await redis.expire(key, RATE_LIMIT_WINDOW);

  if (count > RATE_LIMIT_MAX) {
    console.warn(`[RateLimiter] ${userId}: ${count} req/${RATE_LIMIT_WINDOW}s — vượt giới hạn`);
    return { limited: true, count };
  }

  return { limited: false, count };
}

async function getRateCount(userId) {
  const count = await redis.get(`rate:${userId}`);
  return parseInt(count) || 0;
}

async function resetRateLimit(userId) {
  await redis.del(`rate:${userId}`);
}

module.exports = { checkRateLimit, getRateCount, resetRateLimit };
