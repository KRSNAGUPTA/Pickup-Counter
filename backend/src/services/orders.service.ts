import { prisma } from '../prisma';
import { OrderLine } from '../validation';

export type CreateOrderResult =
  | { ok: true; orderId: string; totalPaise: number; expiresInSeconds: number }
  | { ok: false; status: number; body: Record<string, unknown> };

export async function createOrderWithHold(lines: OrderLine[]): Promise<CreateOrderResult> {
  const sortedIds = lines.map(l => l.productId).sort();

  return prisma.$transaction(async (tx) => {
    // Raw SQL required: Prisma Client has no API for SELECT ... FOR UPDATE.
    // The row lock makes the availability check + hold insert atomic.
    const products = await tx.$queryRaw<any[]>`
      SELECT id, name, "pricePaise", "stockUnits"
      FROM "Product"
      WHERE id = ANY(${sortedIds}::text[])
      ORDER BY id
      FOR UPDATE`;

    const byId = new Map(products.map(p => [p.id, p]));

    const now = new Date();
    const holds = await tx.stockHold.groupBy({
      by: ['productId'],
      where: { productId: { in: sortedIds }, expiresAt: { gt: now } },
      _sum: { quantity: true },
    });
    const held = new Map(holds.map(h => [h.productId, h._sum.quantity ?? 0]));

    let total = 0;
    for (const l of lines) {
      const p = byId.get(l.productId);
      if (!p) {
        return { ok: false, status: 400, body: { error: 'UNKNOWN_PRODUCT', productId: l.productId } };
      }
      const available = p.stockUnits - (held.get(l.productId) ?? 0);
      if (available < l.quantity) {
        return {
          ok: false,
          status: 409,
          body: { error: 'INSUFFICIENT_STOCK', productId: l.productId, requested: l.quantity, available },
        };
      }
      total += p.pricePaise * l.quantity;
    }

    const expiresAt = new Date(Date.now() + 120_000);
    const order = await tx.order.create({
      data: {
        totalPaise: total,
        expiresAt,
        items: {
          create: lines.map(l => ({
            productId: l.productId,
            quantity: l.quantity,
            unitPricePaise: byId.get(l.productId)!.pricePaise,
          })),
        },
        holds: {
          create: lines.map(l => ({
            productId: l.productId,
            quantity: l.quantity,
            expiresAt,
          })),
        },
      },
    });

    const seconds = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
    return { ok: true, orderId: order.id, totalPaise: total, expiresInSeconds: seconds };
  });
}

export type OrderView = {
  id: string;
  status: string;
  totalPaise: number;
  items: { productId: string; quantity: number; unitPricePaise: number }[];
  expiresInSeconds: number;
} | null;

export async function getOrderWithLazyExpiry(id: string): Promise<OrderView> {
  let order = await prisma.order.findUnique({ where: { id }, include: { items: true } });
  if (!order) return null;

  if (order.status === 'pending' && order.expiresAt < new Date()) {
    order = await prisma.order.update({
      where: { id },
      data: { status: 'expired' },
      include: { items: true },
    });
  }

  const expiresInSeconds =
    order.status === 'pending'
      ? Math.max(0, Math.floor((order.expiresAt.getTime() - Date.now()) / 1000))
      : 0;

  return {
    id: order.id,
    status: order.status,
    totalPaise: order.totalPaise,
    items: order.items.map(i => ({
      productId: i.productId,
      quantity: i.quantity,
      unitPricePaise: i.unitPricePaise,
    })),
    expiresInSeconds,
  };
}

export type PickupClaimResult =
  | { ok: true }
  | { ok: false; status: number; body: Record<string, unknown> };

/**
 * Atomically claim an order for pickup.
 * - Only a `paid` order can be claimed.
 * - Two concurrent claims: exactly one succeeds, the other gets 409.
 * - Successful claim permanently reduces stock and releases the hold.
 *
 * Correctness comes from `updateMany({ where: { id, status: 'paid' } })`:
 * Postgres locks the row as part of the UPDATE, so the second concurrent
 * caller's WHERE clause fails after the first commits → count 0 → 409.
 * No raw SQL needed — the conditional write IS the lock.
 */
export async function claimOrder(id: string): Promise<PickupClaimResult> {
  return prisma.$transaction(async (tx) => {
    const result = await tx.order.updateMany({
      where: { id, status: 'paid' },
      data: { status: 'picked_up', pickupClaimedAt: new Date() },
    });

    if (result.count === 0) {
      return { ok: false, status: 409, body: { error: 'CONFLICT' } };
    }

    const items = await tx.orderItem.findMany({ where: { orderId: id } });

    for (const item of items) {
      await tx.product.update({
        where: { id: item.productId },
        data: { stockUnits: { decrement: item.quantity } },
      });
    }

    await tx.stockHold.deleteMany({ where: { orderId: id } });

    return { ok: true };
  });
}