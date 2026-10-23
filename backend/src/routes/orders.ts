import { Router } from 'express';
import { postOrder, getOrder, claimPickup } from '../controllers/orders.controller';

export const ordersRouter = Router();
ordersRouter.post('/', postOrder);
ordersRouter.get('/:id', getOrder);
ordersRouter.post('/:id/pickup-claim', claimPickup);