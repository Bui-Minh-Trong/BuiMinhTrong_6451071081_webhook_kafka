const { Kafka } = require('kafkajs');

const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || '3');

const kafka = new Kafka({
  clientId: 'retry-service',
  brokers: [process.env.KAFKA_BROKER || 'kafka:9092'],
  retry: { initialRetryTime: 300, retries: 5 },
});

const consumer = kafka.consumer({ groupId: 'retry-service-group' });
const producer  = kafka.producer({ allowAutoTopicCreation: true });

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function startRetryService() {
  await consumer.connect();
  await producer.connect();
  await consumer.subscribe({ topic: 'send_failed', fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      let data;
      try {
        data = JSON.parse(message.value.toString());
      } catch {
        console.error('[Retry] message không parse được, bỏ qua');
        return;
      }

      const currentRetry = (data.retryCount || 0) + 1;

      if (currentRetry > MAX_RETRIES) {
        console.error(`[Retry] hết ${MAX_RETRIES} lần → dead_letter`);
        await producer.send({
          topic: 'dead_letter',
          messages: [{ value: JSON.stringify({
            ...data,
            finalError: `exceeded ${MAX_RETRIES} retries`,
            retryCount: currentRetry,
            deadAt: Date.now(),
          }) }],
        });
        return;
      }

      // exponential backoff: 1s, 2s, 4s, ...
      const backoffMs = Math.pow(2, currentRetry - 1) * 1000;
      console.log(`[Retry] attempt ${currentRetry}/${MAX_RETRIES}, waiting ${backoffMs}ms`);
      await delay(backoffMs);

      // consumer.js gửi originalMessage (string), decisionEngine gửi event (object)
      let originalEvent = null;
      if (data.originalMessage) {
        try { originalEvent = JSON.parse(data.originalMessage); } catch { /* noop */ }
      } else if (data.event) {
        originalEvent = data.event;
      }

      if (!originalEvent) {
        console.error('[Retry] không tìm được event gốc → dead_letter');
        await producer.send({
          topic: 'dead_letter',
          messages: [{ value: JSON.stringify({ ...data, finalError: 'missing original event', deadAt: Date.now() }) }],
        });
        return;
      }

      await producer.send({
        topic: 'raw_events',
        messages: [{
          key: originalEvent.eventId,
          value: JSON.stringify(originalEvent),
          headers: { source: 'retry-service', retryCount: String(currentRetry) },
        }],
      });

      console.log(`[Retry] republished ${originalEvent.eventId} (${currentRetry}/${MAX_RETRIES})`);
    },
  });
}

module.exports = { startRetryService };
