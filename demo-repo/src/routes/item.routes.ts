import { Router } from 'express';
import { ItemController } from '@/controllers/item.controller';
import { requireAuth } from '@/middleware/auth.middleware';

export const itemRouter = Router();

itemRouter.get('/', ItemController.list);
itemRouter.get('/:id', ItemController.getById);
itemRouter.post('/', requireAuth, ItemController.create);
itemRouter.delete('/:id', requireAuth, ItemController.delete);
