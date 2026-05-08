const express = require('express');
const { connectProducer } = require('./kafka/producer');
const webhookRouter = require('./routes/webhook');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use('/health', express.json(), (req, res) => {
  res.json({ status: 'ok', service: 'webhook-service', port: PORT });
});

app.use('/webhook', webhookRouter);

const start = async () => {
  try {
    await connectProducer();
    app.listen(PORT, () => {
      console.log(' webhook-service running on http://localhost:' + PORT);
      console.log('   Health check: http://localhost:' + PORT + '/health');
    });
  } catch (err) {
    console.error('❌ Startup failed:', err);
    process.exit(1);
  }
};

start();
