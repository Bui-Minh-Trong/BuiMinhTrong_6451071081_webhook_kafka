// Retry Service — consume topic `send_failed` và retry với Exponential Backoff
// Luồng: send_failed → (retry N lần với delay 1s→2s→4s→...) → raw_events | dead_letter
const { Kafka } = require('kafkajs');

const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || '3');

const kafka = new Kafka({
  clientId: 'retry-service',
  brokers: [process.env.KAFKA_BROKER || 'kafka:9092'],
  retry: {
    initialRetryTime: 300,
    retries: 5,
  },
});

const consumer = kafka.consumer({ groupId: 'retry-service-group' });
const producer = kafka.producer({ allowAutoTopicCreation: true });

/**
 * Delay theo exponential backoff
 * Lần 1: 1s, Lần 2: 2s, Lần 3: 4s, ...
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function startRetryService() {
  await consumer.connect();
  await producer.connect();

  await consumer.subscribe({ topic: 'send_failed', fromBeginning: false });
  console.log('[RetryService] Đang lắng nghe topic: send_failed');

  await consumer.run({
    eachMessage: async ({ message }) => {
      let data;
      try {
        data = JSON.parse(message.value.toString());
      } catch {
        console.error('[RetryService] Không parse được message, bỏ qua');
        return;
      }

      // Lấy retryCount từ message, tăng lên 1
      const currentRetry = (data.retryCount || 0) + 1;

      // ─── Đã vượt quá số lần retry → chuyển sang dead_letter ───
      if (currentRetry > MAX_RETRIES) {
        console.error(`[RetryService] Event đã retry ${MAX_RETRIES} lần → chuyển sang dead_letter`);
        await producer.send({
          topic: 'dead_letter',
          messages: [
            {
              value: JSON.stringify({
                ...data,
                finalError: `Vượt quá ${MAX_RETRIES} lần retry`,
                retryCount: currentRetry,
                deadAt: Date.now(),
              }),
            },
          ],
        });
        return;
      }

      // ─── Tính delay exponential backoff ───
      const backoffMs = Math.pow(2, currentRetry - 1) * 1000;
      console.log(
        `[RetryService] Lần retry ${currentRetry}/${MAX_RETRIES}, chờ ${backoffMs}ms trước khi thử lại...`
      );
      await delay(backoffMs);

      // ─── Lấy event gốc từ message ───
      // consumer.js gửi: { originalMessage, error, timestamp, retryCount }
      // decisionEngine.js gửi: { event, error, retryCount, timestamp }
      let originalEvent = null;
      if (data.originalMessage) {
        try {
          originalEvent = JSON.parse(data.originalMessage);
        } catch {
          console.error('[RetryService] Không parse được originalMessage');
        }
      } else if (data.event) {
        originalEvent = data.event;
      }

      if (!originalEvent) {
        console.error('[RetryService] Không tìm được event gốc → chuyển sang dead_letter');
        await producer.send({
          topic: 'dead_letter',
          messages: [
            {
              value: JSON.stringify({
                ...data,
                finalError: 'Không tìm được event gốc để retry',
                deadAt: Date.now(),
              }),
            },
          ],
        });
        return;
      }

      // ─── Re-publish event gốc vào raw_events để core-service xử lý lại ───
      await producer.send({
        topic: 'raw_events',
        messages: [
          {
            key: originalEvent.eventId,
            value: JSON.stringify(originalEvent),
            headers: {
              source:     'retry-service',
              retryCount: String(currentRetry),
            },
          },
        ],
      });

      console.log(
        `[RetryService] Đã republish event ${originalEvent.eventId} (lần retry ${currentRetry}/${MAX_RETRIES})`
      );
    },
  });
}

module.exports = { startRetryService };
