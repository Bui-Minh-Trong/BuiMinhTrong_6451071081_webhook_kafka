const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379');

// mặc định: mở sau 10 lỗi, chờ 30s trước khi half-open
const FAILURE_THRESHOLD = parseInt(process.env.CB_FAILURE_THRESHOLD || '10');
const OPEN_DURATION     = parseInt(process.env.CB_OPEN_DURATION     || '30');
const CB_KEY            = 'circuit_breaker:facebook_api';

async function getState() {
  const data = await redis.hgetall(CB_KEY);
  if (!data || !data.state) return { state: 'closed', failures: 0, openedAt: 0 };
  return {
    state:    data.state,
    failures: parseInt(data.failures) || 0,
    openedAt: parseInt(data.openedAt) || 0,
  };
}

async function recordSuccess() {
  await redis.hset(CB_KEY, 'failures', 0, 'state', 'closed');
}

async function recordFailure() {
  const failures = await redis.hincrby(CB_KEY, 'failures', 1);
  if (failures >= FAILURE_THRESHOLD) {
    await redis.hset(CB_KEY, 'state', 'open', 'openedAt', String(Date.now()));
    console.warn(`[CircuitBreaker] OPEN — ${failures} lỗi liên tiếp, chặn ${OPEN_DURATION}s`);
  }
  return failures;
}

async function isOpen() {
  const { state, openedAt } = await getState();
  if (state !== 'open') return false;

  // hết thời gian chờ → thử half-open
  if ((Date.now() - openedAt) / 1000 > OPEN_DURATION) {
    await redis.hset(CB_KEY, 'state', 'half-open');
    console.log('[CircuitBreaker] half-open, thử lại...');
    return false;
  }

  return true;
}

async function wrap(fn) {
  if (await isOpen()) {
    throw new Error('circuit breaker OPEN — Facebook API tạm không khả dụng');
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
