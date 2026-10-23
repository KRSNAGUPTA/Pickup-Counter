import { prisma } from '../prisma';

export type ProductView = {
  id: string;
  name: string;
  pricePaise: number;
  availableUnits: number;
};

export async function listProductsWithAvailability(): Promise<ProductView[]> {
  const products = await prisma.product.findMany();
  const now = new Date();
  const holds = await prisma.stockHold.groupBy({
    by: ['productId'],
    where: { expiresAt: { gt: now } },
    _sum: { quantity: true },
  });
  const held = new Map(holds.map(h => [h.productId, h._sum.quantity ?? 0]));

  return products.map(p => ({
    id: p.id,
    name: p.name,
    pricePaise: p.pricePaise,
    availableUnits: p.stockUnits - (held.get(p.id) ?? 0),
  }));
}