const { randomUUID } = require('crypto');

const normalizeComment = (entry) => {
  const value = entry.changes[0].value;
  return {
    eventId: value.comment_id || randomUUID(),
    eventType: 'COMMENT',
    timestamp: value.created_time ? value.created_time * 1000 : Date.now(),
    pageId: entry.id,
    senderId: value.from?.id || null,
    senderName: value.from?.name || null,
    recipientId: value.post_id || null,
    content: value.message || '',
    metadata: {
      postId: value.post_id,
      commentId: value.comment_id,
      parentId: value.parent_id || null,
    },
    raw: value,
  };
};

const normalizeMessage = (entry) => {
  const messaging = entry.messaging[0];
  return {
    eventId: messaging.message?.mid || randomUUID(),
    eventType: 'MESSAGE',
    timestamp: messaging.timestamp || Date.now(),
    pageId: entry.id,
    senderId: messaging.sender?.id || null,
    senderName: null,
    recipientId: messaging.recipient?.id || null,
    content: messaging.message?.text || '',
    metadata: {
      mid: messaging.message?.mid,
      attachments: messaging.message?.attachments || [],
    },
    raw: messaging,
  };
};

const normalizeEvent = (entry) => {
  if (entry.changes) return normalizeComment(entry);
  if (entry.messaging) return normalizeMessage(entry);
  return {
    eventId: randomUUID(),
    eventType: 'UNKNOWN',
    timestamp: Date.now(),
    pageId: entry.id,
    senderId: null,
    recipientId: null,
    content: null,
    metadata: {},
    raw: entry,
  };
};

module.exports = { normalizeEvent };
