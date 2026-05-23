// Alert Service — gửi cảnh báo qua Slack Webhook
// Kích hoạt khi có message vào Dead Letter Queue
const axios = require('axios');

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

/**
 * Gửi cảnh báo Slack khi message bị đẩy vào Dead Letter Queue
 * @param {string} title - Tiêu đề cảnh báo
 * @param {Object} context - Thông tin bổ sung
 */
async function sendSlackAlert(title, context = {}) {
  if (!SLACK_WEBHOOK_URL) {
    // Log ra console nếu chưa cấu hình Slack (không crash)
    console.warn('[Alert] SLACK_WEBHOOK_URL chưa được cấu hình → bỏ qua gửi Slack');
    console.warn('[Alert] Nội dung cảnh báo:', { title, context });
    return;
  }

  try {
    const fields = Object.entries(context).map(([key, value]) => ({
      title: key,
      value: String(value ?? 'N/A'),
      short: true,
    }));

    const payload = {
      text: `🚨 *Dead Letter Queue Alert — ${title}*`,
      attachments: [
        {
          color: 'danger',
          fields,
          footer: 'Core Service Alert',
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    };

    await axios.post(SLACK_WEBHOOK_URL, payload, { timeout: 5000 });
    console.log(`[Alert] Đã gửi Slack alert: ${title}`);
  } catch (err) {
    // Không để alert crash toàn bộ service
    console.error('[Alert] Gửi Slack thất bại:', err.message);
  }
}

/**
 * Cảnh báo đơn giản (chỉ text, không attachment)
 */
async function sendSimpleAlert(text) {
  if (!SLACK_WEBHOOK_URL) {
    console.warn('[Alert]', text);
    return;
  }
  try {
    await axios.post(SLACK_WEBHOOK_URL, { text }, { timeout: 5000 });
  } catch (err) {
    console.error('[Alert] Gửi Slack thất bại:', err.message);
  }
}

module.exports = { sendSlackAlert, sendSimpleAlert };
