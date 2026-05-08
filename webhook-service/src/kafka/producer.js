const { Kafka } = require('kafkajs');
require('dotenv').config();

const kafka = new Kafka({
  clientId: 'webhook-service',
  brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
});

const producer = kafka.producer();

const connectProducer = async () => {
  await producer.connect();
  console.log(' Kafka producer connected');
};

const publishEvent = async (event) => {
  const topic = process.env.KAFKA_TOPIC || 'raw_events';
  await producer.send({
    topic,
    messages: [
      {
        key: event.eventId,
        value: JSON.stringify(event),
        headers: {
          source: 'facebook',
          eventType: event.eventType,
          timestamp: String(event.timestamp),
        },
      },
    ],
  });
  console.log(' Published to ' + topic + ': [' + event.eventType + '] ' + event.eventId);
};

module.exports = { connectProducer, publishEvent };
