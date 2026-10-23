import { Request, Response } from 'express';
import { listProductsWithAvailability } from '../services/products.service';

export async function getProducts(_req: Request, res: Response) {
  try {
    const products = await listProductsWithAvailability();
    res.json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'INTERNAL' });
  }
}