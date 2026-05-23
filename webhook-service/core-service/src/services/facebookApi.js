const axios          = require('axios');
const circuitBreaker = require('./circuitBreaker');

const FB_API     = 'https://graph.facebook.com/v19.0';
const PAGE_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

async function hideComment(commentId) {
  if (!commentId) return { success: false, reason: 'invalid_comment_id' };

  if (!PAGE_TOKEN) {
    // mock khi chưa có token thật — để test local
    console.log(`[Facebook] mock hide: ${commentId}`);
    return { success: true, mock: true };
  }

  return circuitBreaker.wrap(async () => {
    const res = await axios.post(
      `${FB_API}/${commentId}`,
      { is_hidden: true },
      { params: { access_token: PAGE_TOKEN }, timeout: 8000 }
    );
    console.log(`[Facebook] hidden: ${commentId}`);
    return { success: true, data: res.data };
  });
}

async function replyToComment(commentId, message) {
  if (!commentId || !message) return { success: false, reason: 'invalid_params' };

  return circuitBreaker.wrap(async () => {
    const res = await axios.post(
      `${FB_API}/${commentId}/comments`,
      { message },
      { params: { access_token: PAGE_TOKEN }, timeout: 8000 }
    );
    console.log(`[Facebook] replied: ${commentId}`);
    return { success: true, data: res.data };
  });
}

module.exports = { hideComment, replyToComment };