const axios = require('axios');

const FB_API = 'https://graph.facebook.com/v19.0';
const PAGE_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

async function hideComment(commentId) {
  // thay bằng Facebook API thật khi có token hợp lệ
  console.log(`[Facebook] Mock: hiding comment ${commentId}`);
  return { success: true };
}
async function replyToComment(commentId, message) {
  try {
    const res = await axios.post(
      `${FB_API}/${commentId}/comments`,
      { message },
      { params: { access_token: PAGE_TOKEN } }
    );
    return res.data;
  } catch (err) {
    console.error(`[Facebook] Failed to reply:`, err.response?.data || err.message);
    throw err;
  }
}

module.exports = { hideComment, replyToComment };