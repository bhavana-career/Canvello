import { getDatabase } from '@/config/database';
import { UserModel } from '@/models/user.model';
import { User } from '@/types/index';

export class UserRepository {
  private get db() {
    return getDatabase();
  }

  public findByEmail(email: string): UserModel | null {
    const stmt = this.db.prepare('SELECT * FROM users WHERE email = ?');
    const row = stmt.get(email) as User | undefined;
    return row ? new UserModel(row) : null;
  }

  public findById(id: string): UserModel | null {
    const stmt = this.db.prepare('SELECT * FROM users WHERE id = ?');
    const row = stmt.get(id) as User | undefined;
    return row ? new UserModel(row) : null;
  }

  public create(user: User): UserModel {
    const stmt = this.db.prepare(
      'INSERT INTO users (id, email, passwordHash, name, role, createdAt) VALUES (?, ?, ?, ?, ?, ?)'
    );
    stmt.run(user.id, user.email, user.passwordHash, user.name, user.role, user.createdAt);
    return new UserModel(user);
  }

  public list(): UserModel[] {
    const stmt = this.db.prepare('SELECT * FROM users ORDER BY createdAt DESC');
    const rows = stmt.all() as User[];
    return rows.map((r) => new UserModel(r));
  }
}
