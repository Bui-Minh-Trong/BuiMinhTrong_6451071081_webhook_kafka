// Facebook API Service — Gọi Facebook Graph API
// Tích hợp Circuit Breaker để tự động ngắt kết nối khi API lỗi liên tục
const axios           = require('axios');
const circuitBreaker  = require('./circuitBreaker');

const FB_API      = 'https://graph.facebook.com/v19.0';
const PAGE_TOKEN  = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

/**
 * Ẩn bình luận spam/vi phạm trên Facebook Page
 * Yêu cầu: Page Access Token có quyền manage_pages
 */
async function hideComment(commentId) {
  if (!commentId) {
    console.warn('[Facebook] commentId không hợp lệ, bỏ qua hideComment');
    return { success: false, reason: 'invalid_comment_id' };
  }

  if (!PAGE_TOKEN) {
    // Fallback mock khi chưa có token — vẫn log để debug
    console.log(`[Facebook] Mock: ẩn comment ${commentId} (FACEBOOK_PAGE_ACCESS_TOKEN chưa được cấu hình)`);
    return { success: true, mock: true };
  }

  // ─── Bọc trong circuit breaker để tự động ngắt khi lỗi liên tiếp ───
  return await circuitBreaker.wrap(async () => {
    const response = await axios.post(
      `${FB_API}/${commentId}`,
      { is_hidden: true },
      {
        params:  { access_token: PAGE_TOKEN },
        timeout: 8000,
      }
    );
    console.log(`[Facebook] Đã ẩn comment ${commentId}`);
    return { success: true, data: response.data };
  });
}

/**
 * Reply vào bình luận trên Facebook Page
 * Yêu cầu: Page Access Token có quyền pages_manage_engagement
 */
async function replyToComment(commentId, message) {
  if (!commentId || !message) {
    console.warn('[Facebook] commentId hoặc message không hợp lệ, bỏ qua reply');
    return { success: false, reason: 'invalid_params' };
  }

  return await circuitBreaker.wrap(async () => {
    const response = await axios.post(
      `${FB_API}/${commentId}/comments`,
      { message },
      {
        params:  { access_token: PAGE_TOKEN },
        timeout: 8000,
      }
    );
    console.log(`[Facebook] Đã reply comment ${commentId}`);
    return { success: true, data: response.data };
  });
}

module.exports = { hideComment, replyToComment };