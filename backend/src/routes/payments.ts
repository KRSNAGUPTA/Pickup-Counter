import { Router } from 'express';
import { postWebhook } from '../controllers/payments.controller';

export const paymentsRouter = Router();
paymentsRouter.post('/webhook', postWebhook);