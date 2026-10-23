import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { productsRouter } from './routes/products';
import { ordersRouter } from './routes/orders';
import { paymentsRouter } from './routes/payments';

const app = express();
app.use(cors());

app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/products', productsRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/payments', paymentsRouter);

if (require.main === module) {
  const port = Number(process.env.PORT ?? 3000);
  app.listen(port, () => console.log(`API listening on :${port}`));
}

export { app };