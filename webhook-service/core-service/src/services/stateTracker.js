// Theo dõi trạng thái: received → processing → processed/failed → replied
const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379');

const STATES = {
  RECEIVED: 'received',
  PROCESSING: 'processing',
  PROCESSED: 'processed',
  REPLIED: 'replied',
  FAILED: 'failed',
  HIDDEN: 'hidden',
};

async function setState(eventId, state, metadata = {}) {
  const key = `event:${eventId}`;
  const data = {
    state,
    updatedAt: Date.now(),
    ...metadata,
  };
  await redis.hset(key, 'current', JSON.stringify(data));
  // Lưu lịch sử state
  await redis.rpush(`${key}:history`, JSON.stringify(data));
  await redis.expire(key, 7 * 24 * 60 * 60); // giữ 7 ngày
}

async function getState(eventId) {
  const data = await redis.hget(`event:${eventId}`, 'current');
  return data ? JSON.parse(data) : null;
}

module.exports = { setState, getState, STATES };