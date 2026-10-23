import { beforeEach } from 'vitest';
import { prisma } from '../src/prisma';

beforeEach(async () => {
  await prisma.orderItem.deleteMany();
  await prisma.stockHold.deleteMany();
  await prisma.order.deleteMany();
  await prisma.processedWebhook.deleteMany();
  await prisma.product.deleteMany();
});