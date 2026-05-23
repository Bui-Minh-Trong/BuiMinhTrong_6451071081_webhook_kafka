// Core Service — Entry point
// Khởi động đồng thời: main consumer + retry service + DLQ consumer
require('dotenv').config();

const { startConsumer }     = require('./kafka/consumer');
const { processEvent }      = require('./pipeline/decisionEngine');
const { startRetryService } = require('./services/retryService');
const { startDLQConsumer }  = require('./kafka/dlqConsumer');

async function main() {
  console.log('[Core Service] Đang khởi động...');

  // Chạy song song 3 consumer độc lập:
  // 1. Main consumer: raw_events → processEvent pipeline
  // 2. Retry Service: send_failed → exponential backoff → raw_events | dead_letter
  // 3. DLQ Consumer: dead_letter → Slack alert
  await Promise.all([
    startConsumer(processEvent).then(() =>
      console.log('[Core Service] ✅ Main consumer đang lắng nghe raw_events...')
    ),
    startRetryService().then(() =>
      console.log('[Core Service] ✅ Retry Service đang lắng nghe send_failed...')
    ),
    startDLQConsumer().then(() =>
      console.log('[Core Service] ✅ DLQ Consumer đang lắng nghe dead_letter...')
    ),
  ]);
}

main().catch(err => {
  console.error('[Core Service] Lỗi nghiêm trọng khi khởi động:', err);
  process.exit(1);
});