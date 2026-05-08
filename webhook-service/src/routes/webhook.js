const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { publishEvent } = require('../kafka/producer');
const { normalizeEvent } = require('../utils/normalizer');
require('dotenv').config();

router.get('/', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  console.log(' Verification request:', { mode, token });
  if (mode === 'subscribe' && token === process.env.FB_VERIFY_TOKEN) {
    console.log(' Webhook verified!');
    return res.status(200).send(challenge);
  }
  console.error(' Verification failed');
  return res.sendStatus(403);
});

router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['x-hub-signature-256'];
  if (process.env.NODE_ENV !== 'development' && !verifySignature(req.body, signature)) {
    console.error(' Invalid signature');
    return res.sendStatus(401);
  }
  const body = JSON.parse(req.body.toString());
  if (body.object !== 'page') return res.sendStatus(404);
  res.sendStatus(200);
  try {
    for (const entry of body.entry) {
      const normalizedEvent = normalizeEvent(entry);
      await publishEvent(normalizedEvent);
    }
  } catch (err) {
    console.error(' Error processing event:', err);
  }
});

function verifySignature(rawBody, signatureHeader) {
  if (!signatureHeader) return false;
  const expected = 'sha256=' +
    crypto.createHmac('sha256', process.env.FB_APP_SECRET)
      .update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
  } catch { return false; }
}

module.exports = router;
