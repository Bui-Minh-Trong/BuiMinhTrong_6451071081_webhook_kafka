// DLQ Consumer — consume topic `dead_letter` và gửi cảnh báo Slack
// Đây là điểm cuối của pipeline: event đến đây đồng nghĩa đã thất bại hoàn toàn
// → Cần cảnh báo ngay để nhóm vận hành xử lý thủ công
const { Kafka } = require('kafkajs');
const { sendSlackAlert } = require('../services/alertService');

const kafka = new Kafka({
  clientId: 'dlq-consumer',
  brokers: [process.env.KAFKA_BROKER || 'kafka:9092'],
});

const consumer = kafka.consumer({ groupId: 'dlq-consumer-group' });

async function startDLQConsumer() {
  await consumer.connect();
  await consumer.subscribe({ topic: 'dead_letter', fromBeginning: false });
  console.log('[DLQConsumer] Đang lắng nghe topic: dead_letter');

  await consumer.run({
    eachMessage: async ({ message }) => {
      let data;
      try {
        data = JSON.parse(message.value.toString());
      } catch {
        console.error('[DLQConsumer] Không parse được DLQ message');
        return;
      }

      // Lấy thông tin để log và alert
      const eventId   = data.event?.eventId || data.originalEvent?.eventId || 'UNKNOWN';
      const userId    = data.event?.senderId || 'UNKNOWN';
      const error     = data.finalError || data.error || 'Không rõ lỗi';
      const retries   = data.retryCount || 0;
      const deadAt    = data.deadAt ? new Date(data.deadAt).toISOString() : new Date().toISOString();

      console.error(
        `[DLQConsumer] 💀 Event ${eventId} vào Dead Letter Queue sau ${retries} lần retry — ${error}`
      );

      // ─── Gửi cảnh báo Slack ───
      await sendSlackAlert('Event thất bại hoàn toàn — cần xử lý thủ công', {
        'Event ID':      eventId,
        'User ID':       userId,
        'Lỗi':           error,
        'Số lần retry':  retries,
        'Thời điểm':     deadAt,
      });
    },
  });
}

module.exports = { startDLQConsumer };
