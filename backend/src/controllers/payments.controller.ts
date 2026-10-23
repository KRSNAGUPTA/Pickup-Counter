import { Request, Response } from 'express';
import { verifySignature, processWebhook } from '../services/payments.service';
import { WebhookSchema } from '../validation';

export async function postWebhook(req: Request, res: Response) {
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
  const signature = req.header('x-signature');

  if (!verifySignature(raw, signature)) {
    return res.status(401).json({ error: 'BAD_SIGNATURE' });
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'INVALID_JSON' });
  }

  const parsed = WebhookSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'VALIDATION_FAILED',
      details: parsed.error.issues,
    });
  }

  try {
    const result = await processWebhook(parsed.data);
    if (!result.ok) return res.status(result.status).json(result.body);
    return res.status(200).json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'INTERNAL' });
  }
}