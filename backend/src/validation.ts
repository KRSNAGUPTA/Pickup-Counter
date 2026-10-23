import { z } from 'zod';

export const OrderLineSchema = z.object({
  productId: z.string().min(1, 'productId is required'),
  quantity: z.number().int().positive('quantity must be a positive integer'),
});

export const CreateOrderSchema = z.object({
  items: z.array(OrderLineSchema).min(1, 'items must contain at least one line'),
});

export const OrderIdParamSchema = z.object({
  id: z.string().min(1, 'order id is required'),
});

export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;
export type OrderLine = z.infer<typeof OrderLineSchema>;

export function mergeLines(lines: OrderLine[]): OrderLine[] {
  const merged = new Map<string, number>();
  for (const l of lines) merged.set(l.productId, (merged.get(l.productId) ?? 0) + l.quantity);
  return [...merged.entries()].map(([productId, quantity]) => ({ productId, quantity }));
}

export const WebhookSchema = z.object({
  eventId: z.string().min(1, 'eventId is required'),
  orderId: z.string().min(1, 'orderId is required'),
  amountPaise: z.number().int().nonnegative('amountPaise must be a non-negative integer'),
  status: z.literal('captured'),
});

export type WebhookInput = z.infer<typeof WebhookSchema>;

export const SimulateSchema = z.object({
  orderId: z.string().min(1),
  amountPaise: z.number().int().nonnegative(),
  eventId: z.string().min(1).optional(),
});
export type SimulateInput = z.infer<typeof SimulateSchema>;