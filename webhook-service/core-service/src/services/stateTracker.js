// State Tracker — theo dõi vòng đời của mỗi event qua Redis
// Trạng thái: received → processing → processed | hidden | failed | replied | pending_review
const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379');

const STATES = {
  RECEIVED:       'received',
  PROCESSING:     'processing',
  PROCESSED:      'processed',
  REPLIED:        'replied',
  FAILED:         'failed',
  HIDDEN:         'hidden',
  PENDING_REVIEW: 'pending_review', // bị rate limit → chờ review thủ công
};

/**
 * Cập nhật state của event và ghi vào lịch sử
 */
async function setState(eventId, state, metadata = {}) {
  const key  = `event:${eventId}`;
  const data = {
    state,
    updatedAt: Date.now(),
    ...metadata,
  };
  await redis.hset(key, 'current', JSON.stringify(data));
  // Lưu lịch sử đầy đủ để audit trail
  await redis.rpush(`${key}:history`, JSON.stringify(data));
  await redis.expire(key, 7 * 24 * 60 * 60); // giữ 7 ngày
}

/**
 * Lấy state hiện tại của event
 */
async function getState(eventId) {
  const data = await redis.hget(`event:${eventId}`, 'current');
  return data ? JSON.parse(data) : null;
}

/**
 * Lấy toàn bộ lịch sử state của event
 */
async function getStateHistory(eventId) {
  const history = await redis.lrange(`event:${eventId}:history`, 0, -1);
  return history.map(item => JSON.parse(item));
}

module.exports = { setState, getState, getStateHistory, STATES };