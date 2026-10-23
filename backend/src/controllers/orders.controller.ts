import { Request, Response } from 'express';
import { CreateOrderSchema, mergeLines, OrderIdParamSchema } from '../validation';
import { claimOrder, createOrderWithHold, getOrderWithLazyExpiry } from '../services/orders.service';

export async function postOrder(req: Request, res: Response) {
  const parsed = CreateOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'VALIDATION_FAILED',
      details: parsed.error.issues,
    });
  }

  const lines = mergeLines(parsed.data.items);

  try {
    const result = await createOrderWithHold(lines);
    if (!result.ok) return res.status(result.status).json(result.body);
    return res.status(201).json({
      orderId: result.orderId,
      totalPaise: result.totalPaise,
      expiresInSeconds: result.expiresInSeconds,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'INTERNAL' });
  }
}

export async function getOrder(req: Request, res: Response) {
  const params = OrderIdParamSchema.safeParse(req.params);
  if (!params.success) {
    return res.status(400).json({
      error: 'VALIDATION_FAILED',
      details: params.error.issues,
    });
  }

  try {
    const order = await getOrderWithLazyExpiry(params.data.id);
    if (!order) return res.status(404).json({ error: 'NOT_FOUND' });
    return res.json(order);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'INTERNAL' });
  }
}

export async function claimPickup(req: Request, res: Response) {
  const params = OrderIdParamSchema.safeParse(req.params);
  if (!params.success) {
    return res.status(400).json({ error: 'VALIDATION_FAILED', details: params.error.issues });
  }

  try {
    const result = await claimOrder(params.data.id);
    if (!result.ok) return res.status(result.status).json(result.body);
    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'INTERNAL' });
  }
}