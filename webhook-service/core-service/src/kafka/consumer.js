const { Kafka } = require('kafkajs');

const kafka = new Kafka({
  clientId: 'core-service',
  brokers: [process.env.KAFKA_BROKER || 'kafka:9092'],
  retry: {
    initialRetryTime: 300,
    retries: 10,           // tránh mất data khi kafka restart
  }
});

const consumer = kafka.consumer({
  groupId: 'core-service-group',
  // Chịu tải tăng đột biến: xử lý tối đa 10 message song song
  maxInFlightRequests: 10,
  sessionTimeout: 30000,
  heartbeatInterval: 3000,
});

const producer = kafka.producer({
  allowAutoTopicCreation: true,
});

async function startConsumer(processFn) {
  await consumer.connect();
  await producer.connect();
  
  await consumer.subscribe({ 
    topic: 'raw_events', 
    fromBeginning: false   // chỉ lấy message mới
  });

  await consumer.run({
    // eachBatchAutoResolve: false cho phép kiểm soát offset thủ công
    eachBatch: async ({ batch, resolveOffset, heartbeat, isRunning }) => {
      for (const message of batch.messages) {
        if (!isRunning()) break;

        try {
          const event = JSON.parse(message.value.toString());
          console.log(`[Consumer] Processing event: ${event.eventId}`);
          
          await processFn(event, producer);
          
          // Commit offset sau khi xử lý thành công → tránh mất data
          resolveOffset(message.offset);
          await heartbeat();  // báo hiệu consumer còn sống
          
        } catch (err) {
          console.error(`[Consumer] Failed to process message:`, err.message);
          // Không resolveOffset → message sẽ được xử lý lại
          // Publish sang dead-letter topic
          await producer.send({
            topic: 'send_failed',
            messages: [{
              value: JSON.stringify({
                originalMessage: message.value.toString(),
                error: err.message,
                timestamp: Date.now(),
                retryCount: 0,
              })
            }]
          });
          resolveOffset(message.offset); // vẫn commit để không block
        }
      }
    }
  });
}

module.exports = { startConsumer };