import { Router } from 'express';
import { postWebhook, postSimulate } from '../controllers/payments.controller';

export const paymentsRouter = Router();
paymentsRouter.post('/webhook', postWebhook);
paymentsRouter.post('/simulate', postSimulate);