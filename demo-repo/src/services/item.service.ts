import { ItemRepository } from '@/repositories/item.repository';
import { ItemModel } from '@/models/item.model';
import { generateId } from '@/utils/crypto';
import { Item } from '@/types/index';

export class ItemService {
  constructor(private itemRepo: ItemRepository = new ItemRepository()) {}

  public createItem(title: string, description: string, ownerId: string, price: number): ItemModel {
    if (price < 0) {
      throw new Error('Price cannot be negative');
    }

    const newItem: Item = {
      id: generateId(),
      title,
      description,
      ownerId,
      price,
      createdAt: new Date().toISOString(),
    };

    return this.itemRepo.create(newItem);
  }

  public getItem(id: string): ItemModel | null {
    return this.itemRepo.findById(id);
  }

  public listItems(): ItemModel[] {
    return this.itemRepo.listAll();
  }

  public deleteItem(id: string, requesterId: string): boolean {
    const item = this.itemRepo.findById(id);
    if (!item) {
      throw new Error('Item not found');
    }
    if (item.ownerId !== requesterId) {
      throw new Error('Forbidden: Not your item');
    }
    return this.itemRepo.delete(id);
  }
}
