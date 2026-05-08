require('dotenv').config();
const { startConsumer } = require('./kafka/consumer');
const { processEvent } = require('./pipeline/decisionEngine');

async function main() {
  console.log('[Core Service] Starting...');
  await startConsumer(processEvent);
  console.log('[Core Service] Consuming raw_events...');
}

main().catch(err => {
  console.error('[Core Service] Fatal error:', err);
  process.exit(1);
});