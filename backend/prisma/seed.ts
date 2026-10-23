import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const p = new PrismaClient({ adapter });

(async () => {
  await p.orderItem.deleteMany();
  await p.stockHold.deleteMany();
  await p.order.deleteMany();
  await p.processedWebhook.deleteMany();
  await p.product.deleteMany();

  await p.product.createMany({
    data: [
      { name: 'Chips',     pricePaise: 2000, stockUnits: 10 },
      { name: 'Chocolate', pricePaise: 4500, stockUnits: 5  },
      { name: 'Cola',      pricePaise: 3000, stockUnits: 2  },
      { name: 'Biscuit',   pricePaise: 1500, stockUnits: 20 },
      { name: 'Juice',     pricePaise: 5000, stockUnits: 3  },
    ],
  });

  console.log('Seeded 5 products');
  await p.$disconnect();
})();