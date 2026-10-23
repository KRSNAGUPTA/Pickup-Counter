import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import * as crypto from 'crypto';
import { app } from '../src/index';
import { prisma } from '../src/prisma';

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET ?? 'devsecret';

function sign(body: string): string {
  return crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
}

async function createCola(stock: number) {
  return prisma.product.create({
    data: { name: 'Cola', pricePaise: 3000, stockUnits: stock },
  });
}

describe('concurrency', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('10 concurrent buyers vs last 2 units → exactly 2 held, 8 rejected', async () => {
    const cola = await createCola(2);

    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        request(app)
          .post('/api/orders')
          .send({ items: [{ productId: cola.id, quantity: 1 }] }),
      ),
    );

    const created = responses.filter(r => r.status === 201);
    const rejected = responses.filter(r => r.status === 409);

    expect(created).toHaveLength(2);
    expect(rejected).toHaveLength(8);
    for (const r of rejected) {
      expect(r.body.error).toBe('INSUFFICIENT_STOCK');
    }

    const holds = await prisma.stockHold.aggregate({
      where: { productId: cola.id, expiresAt: { gt: new Date() } },
      _sum: { quantity: true },
    });
    expect(holds._sum.quantity).toBe(2);

    const product = await prisma.product.findUnique({ where: { id: cola.id } });
    expect(product!.stockUnits).toBe(2); // not yet decremented — held, not sold
  });

  it('duplicate webhook event → processed once', async () => {
    const cola = await createCola(2);

    const orderRes = await request(app)
      .post('/api/orders')
      .send({ items: [{ productId: cola.id, quantity: 1 }] });
    expect(orderRes.status).toBe(201);

    const orderId = orderRes.body.orderId;
    const body = JSON.stringify({
      eventId: 'evt_dup_test',
      orderId,
      amountPaise: 3000,
      status: 'captured',
    });
    const sig = sign(body);

    const send = () =>
      request(app)
        .post('/api/payments/webhook')
        .set('content-type', 'application/json')
        .set('x-signature', sig)
        .send(body);

    const first = await send();
    const second = await send();

    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ ok: true, paid: true });

    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ ok: true, duplicate: true });

    const processedCount = await prisma.processedWebhook.count({
      where: { eventId: 'evt_dup_test' },
    });
    expect(processedCount).toBe(1);

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order!.status).toBe('paid');
  });

  it('two simultaneous pickup claims → exactly one succeeds', async () => {
    const cola = await createCola(2);

    const orderRes = await request(app)
      .post('/api/orders')
      .send({ items: [{ productId: cola.id, quantity: 1 }] });
    expect(orderRes.status).toBe(201);
    const orderId = orderRes.body.orderId;

    // Pay it
    const body = JSON.stringify({
      eventId: 'evt_pickup_test',
      orderId,
      amountPaise: 3000,
      status: 'captured',
    });
    await request(app)
      .post('/api/payments/webhook')
      .set('content-type', 'application/json')
      .set('x-signature', sign(body))
      .send(body);

    // Two concurrent claims
    const [a, b] = await Promise.all([
      request(app).post(`/api/orders/${orderId}/pickup-claim`),
      request(app).post(`/api/orders/${orderId}/pickup-claim`),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);

    const product = await prisma.product.findUnique({ where: { id: cola.id } });
    expect(product!.stockUnits).toBe(1); // decremented exactly once (from 2 → 1)

    const holds = await prisma.stockHold.count({ where: { orderId } });
    expect(holds).toBe(0);
  });
});