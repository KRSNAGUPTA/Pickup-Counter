import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { productsRouter } from './src/routes/products';
import { ordersRouter } from './src/routes/orders';
import { paymentsRouter } from './src/routes/payments';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());

app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/products', productsRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/payments', paymentsRouter);

const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMain) {
  const port = Number(process.env.PORT ?? 3000);
  app.listen(port, () => console.log(`API listening on :${port}`));
}

export { app };