import * as crypto from 'crypto';
import { prisma } from '../prisma';
import { WebhookInput } from '../validation';

export function verifySignature(rawBody: Buffer, signature: string | undefined): boolean {
  if (!signature) return false;
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  // Constant-time compare; guard length to avoid timingSafeEqual throwing
  if (signature.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(signature, 'utf8'), Buffer.from(expected, 'utf8'));
}

export type WebhookResult =
  | { ok: true; duplicate?: boolean; paid?: boolean; review?: boolean; reason?: string; ignored?: string; already?: string }
  | { ok: false; status: number; body: Record<string, unknown> };

/**
 * Idempotent webhook processing.
 * - Duplicate eventId  → no-op, return ok
 * - Amount mismatch    → status=needs_review, hold kept, return ok
 * - Order already paid → no-op, return ok
 * - Valid capture, hold live → paid
 * - Valid capture, hold expired → try re-acquire stock; if success → paid, else → needs_review
 */
export async function processWebhook(event: WebhookInput): Promise<WebhookResult> {
  return prisma.$transaction(async (tx) => {
    // 1) Idempotency: insert eventId first. If it already exists, this throws a
    //    P2002 unique violation and we return a duplicate no-op.
    try {
      await tx.processedWebhook.create({ data: { eventId: event.eventId, orderId: event.orderId } });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        return { ok: true, duplicate: true };
      }
      throw e;
    }

    // 2) Load order
    const order = await tx.order.findUnique({
      where: { id: event.orderId },
      include: { items: true },
    });
    if (!order) return { ok: true, ignored: 'no_order' };

    if (order.status === 'paid' || order.status === 'picked_up') {
      return { ok: true, already: order.status };
    }

    // 3) Amount mismatch → needs_review, keep hold (ops will reconcile)
    if (event.amountPaise !== order.totalPaise) {
      await tx.order.update({ where: { id: order.id }, data: { status: 'needs_review' } });
      return { ok: true, review: true, reason: 'AMOUNT_MISMATCH' };
    }

    // 4) Try to (re-)acquire stock under lock.
    //    For a live hold this succeeds because the hold counts against available,
    //    but we EXCLUDE this order's own hold from the "held" sum below.
    //    For an expired hold this is the "late payment" path — succeed only if
    //    units are still available.
    const ids = order.items.map(i => i.productId).sort();
    const products = await tx.$queryRaw<any[]>`
      SELECT id, "stockUnits" FROM "Product"
      WHERE id = ANY(${ids}::text[])
      ORDER BY id
      FOR UPDATE`;
    const byId = new Map(products.map(p => [p.id, p]));

    const now = new Date();
    const holds = await tx.stockHold.groupBy({
      by: ['productId'],
      where: {
        productId: { in: ids },
        expiresAt: { gt: now },
        orderId: { not: order.id }, // exclude own hold
      },
      _sum: { quantity: true },
    });
    const held = new Map(holds.map(h => [h.productId, h._sum.quantity ?? 0]));

    for (const item of order.items) {
      const p = byId.get(item.productId);
      if (!p) return { ok: true, review: true, reason: 'PRODUCT_GONE' };
      const available = p.stockUnits - (held.get(item.productId) ?? 0);
      if (available < item.quantity) {
        await tx.order.update({ where: { id: order.id }, data: { status: 'needs_review' } });
        return { ok: true, review: true, reason: 'OUT_OF_STOCK_LATE_PAYMENT' };
      }
    }

    // 5) Success — mark paid and refresh own hold to a fresh window so pickup
    //    has a clean state regardless of how late the payment arrived.
    const newExpiry = new Date(Date.now() + 120_000);
    await tx.stockHold.updateMany({ where: { orderId: order.id }, data: { expiresAt: newExpiry } });
    await tx.order.update({
      where: { id: order.id },
      data: { status: 'paid', paidAt: new Date() },
    });

    return { ok: true, paid: true };
  });
}

/**
 * Mock payment provider: sign a webhook body and deliver it to our own
 * /api/payments/webhook. Used only by the customer screen's Pay button so a
 * reviewer can exercise the full flow from the browser. The real webhook is
 * still the only endpoint that mutates order state.
 */
export async function simulateProviderWebhook(input: {
  orderId: string;
  amountPaise: number;
  eventId?: string;
}): Promise<{ status: number; body: unknown }> {
  const eventId = input.eventId ?? `evt_sim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const body = JSON.stringify({
    eventId,
    orderId: input.orderId,
    amountPaise: input.amountPaise,
    status: 'captured',
  });
  const secret = process.env.WEBHOOK_SECRET ?? 'devsecret';
  const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');

  const port = Number(process.env.PORT ?? 3000);
  const res = await fetch(`http://localhost:${port}/api/payments/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-signature': signature },
    body,
  });
  return { status: res.status, body: await res.json() };
}