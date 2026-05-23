const axios = require('axios');

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

async function sendSlackAlert(title, context = {}) {
  if (!SLACK_WEBHOOK_URL) {
    // chưa cấu hình Slack — log ra console thay thế
    console.warn('[Alert] no SLACK_WEBHOOK_URL, skipping:', title, context);
    return;
  }

  try {
    const fields = Object.entries(context).map(([key, value]) => ({
      title: key,
      value: String(value ?? 'N/A'),
      short: true,
    }));

    await axios.post(SLACK_WEBHOOK_URL, {
      text: `🚨 *DLQ Alert — ${title}*`,
      attachments: [{ color: 'danger', fields, ts: Math.floor(Date.now() / 1000) }],
    }, { timeout: 5000 });

    console.log(`[Alert] sent: ${title}`);
  } catch (err) {
    // không để alert crash service chính
    console.error('[Alert] Slack call failed:', err.message);
  }
}

async function sendSimpleAlert(text) {
  if (!SLACK_WEBHOOK_URL) { console.warn('[Alert]', text); return; }
  try {
    await axios.post(SLACK_WEBHOOK_URL, { text }, { timeout: 5000 });
  } catch (err) {
    console.error('[Alert] Slack call failed:', err.message);
  }
}

module.exports = { sendSlackAlert, sendSimpleAlert };
