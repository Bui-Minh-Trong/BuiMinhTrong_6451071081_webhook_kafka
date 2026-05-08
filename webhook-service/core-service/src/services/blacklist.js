const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379');

const SPAM_COUNT_TTL = 24 * 60 * 60; // 24 giờ (seconds)
const BLACKLIST_KEY = 'blacklist:users';

async function incrementSpamCount(userId) {
  const key = `spam_count:${userId}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, SPAM_COUNT_TTL); // reset sau 24h
  }
  return count;
}

async function getSpamCount(userId) {
  const count = await redis.get(`spam_count:${userId}`);
  return parseInt(count) || 0;
}

async function addToBlacklist(userId, reason) {
  await redis.hset(BLACKLIST_KEY, userId, JSON.stringify({
    reason,
    addedAt: Date.now(),
  }));
  console.log(`[Blacklist] User ${userId} added: ${reason}`);
}

async function isBlacklisted(userId) {
  const result = await redis.hget(BLACKLIST_KEY, userId);
  return result !== null;
}

module.exports = { incrementSpamCount, getSpamCount, addToBlacklist, isBlacklisted };