import 'dotenv/config';
import * as crypto from 'crypto';

const [, , orderId, amountPaise, eventIdArg] = process.argv;

if (!orderId || !amountPaise) {
  console.error('usage: npm run send-webhook -- <orderId> <amountPaise> [eventId]');
  process.exit(1);
}

const eventId = eventIdArg || `evt_${Date.now()}`;
const body = JSON.stringify({
  eventId,
  orderId,
  amountPaise: Number(amountPaise),
  status: 'captured',
});

const secret = process.env.WEBHOOK_SECRET || 'devsecret';
const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');

const url = `http://localhost:${process.env.PORT ?? 3000}/api/payments/webhook`;

fetch(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-signature': signature },
  body,
})
  .then(async (r) => {
    const text = await r.text();
    console.log(`HTTP ${r.status}`);
    console.log(text);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });