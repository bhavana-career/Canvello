import { Request, Response, NextFunction } from 'express';
import { ItemService } from '@/services/item.service';

const itemService = new ItemService();

export class ItemController {
  public static async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { title, description, price } = req.body;
      const ownerId = req.user!.userId;
      const item = itemService.createItem(title, description, ownerId, Number(price));
      res.status(201).json(item);
    } catch (err) {
      next(err);
    }
  }

  public static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const items = itemService.listItems();
      res.json(items);
    } catch (err) {
      next(err);
    }
  }

  public static async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const item = itemService.getItem(req.params.id);
      if (!item) {
        res.status(404).json({ error: 'Item not found' });
        return;
      }
      res.json(item);
    } catch (err) {
      next(err);
    }
  }

  public static async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const requesterId = req.user!.userId;
      itemService.deleteItem(req.params.id, requesterId);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
}
