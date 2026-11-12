import { Item } from '@/types/index';

export class ItemModel implements Item {
  id: string;
  title: string;
  description: string;
  ownerId: string;
  price: number;
  createdAt: string;

  constructor(data: Item) {
    this.id = data.id;
    this.title = data.title;
    this.description = data.description;
    this.ownerId = data.ownerId;
    this.price = data.price;
    this.createdAt = data.createdAt;
  }
}
