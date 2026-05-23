require('dotenv').config();

const { startConsumer }     = require('./kafka/consumer');
const { processEvent }      = require('./pipeline/decisionEngine');
const { startRetryService } = require('./services/retryService');
const { startDLQConsumer }  = require('./kafka/dlqConsumer');

async function main() {
  await Promise.all([
    startConsumer(processEvent),
    startRetryService(),
    startDLQConsumer(),
  ]);
  console.log('[Core Service] all consumers running');
}

main().catch(err => {
  console.error('[Core Service] startup failed:', err);
  process.exit(1);
});