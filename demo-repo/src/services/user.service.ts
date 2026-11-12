import { UserRepository } from '@/repositories/user.repository';
import { UserModel } from '@/models/user.model';
import { User } from '@/types/index';

export class UserService {
  constructor(private userRepo: UserRepository = new UserRepository()) {}

  public getUserById(id: string): Omit<User, 'passwordHash'> | null {
    const user = this.userRepo.findById(id);
    return user ? user.toJSON() : null;
  }

  public listUsers(): Omit<User, 'passwordHash'>[] {
    const users = this.userRepo.list();
    return users.map((u) => u.toJSON());
  }
}
