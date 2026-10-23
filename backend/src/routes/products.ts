import { Router } from 'express';
import { getProducts } from '../controllers/products.controller';

export const productsRouter = Router();
productsRouter.get('/', getProducts);