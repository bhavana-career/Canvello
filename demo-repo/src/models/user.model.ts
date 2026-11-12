import { User } from '@/types/index';

export class UserModel implements User {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  role: 'admin' | 'user';
  createdAt: string;

  constructor(data: User) {
    this.id = data.id;
    this.email = data.email;
    this.passwordHash = data.passwordHash;
    this.name = data.name;
    this.role = data.role;
    this.createdAt = data.createdAt;
  }

  toJSON(): Omit<User, 'passwordHash'> {
    const { passwordHash, ...safeUser } = this;
    return safeUser;
  }
}
