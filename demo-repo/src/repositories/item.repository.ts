import { getDatabase } from '@/config/database';
import { ItemModel } from '@/models/item.model';
import { Item } from '@/types/index';

export class ItemRepository {
  private get db() {
    return getDatabase();
  }

  public findById(id: string): ItemModel | null {
    const stmt = this.db.prepare('SELECT * FROM items WHERE id = ?');
    const row = stmt.get(id) as Item | undefined;
    return row ? new ItemModel(row) : null;
  }

  public listByOwner(ownerId: string): ItemModel[] {
    const stmt = this.db.prepare('SELECT * FROM items WHERE ownerId = ? ORDER BY createdAt DESC');
    const rows = stmt.all(ownerId) as Item[];
    return rows.map((r) => new ItemModel(r));
  }

  public listAll(): ItemModel[] {
    const stmt = this.db.prepare('SELECT * FROM items ORDER BY createdAt DESC');
    const rows = stmt.all() as Item[];
    return rows.map((r) => new ItemModel(r));
  }

  public create(item: Item): ItemModel {
    const stmt = this.db.prepare(
      'INSERT INTO items (id, title, description, ownerId, price, createdAt) VALUES (?, ?, ?, ?, ?, ?)'
    );
    stmt.run(item.id, item.title, item.description, item.ownerId, item.price, item.createdAt);
    return new ItemModel(item);
  }

  public delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM items WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }
}
