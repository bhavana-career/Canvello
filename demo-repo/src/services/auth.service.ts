import jwt from 'jsonwebtoken';
import { config } from '@/config/index';
import { UserRepository } from '@/repositories/user.repository';
import { hashPassword, verifyPassword, generateId } from '@/utils/crypto';
import { AuthTokenPayload, User } from '@/types/index';

export class AuthService {
  constructor(private userRepo: UserRepository = new UserRepository()) {}

  public register(email: string, password: string, name: string): { user: Omit<User, 'passwordHash'>; token: string } {
    const existing = this.userRepo.findByEmail(email);
    if (existing) {
      throw new Error('User already exists with this email');
    }

    const newUser: User = {
      id: generateId(),
      email,
      passwordHash: hashPassword(password),
      name,
      role: 'user',
      createdAt: new Date().toISOString(),
    };

    const saved = this.userRepo.create(newUser);
    const token = this.generateToken({
      userId: saved.id,
      email: saved.email,
      role: saved.role,
    });

    return { user: saved.toJSON(), token };
  }

  public login(email: string, password: string): { user: Omit<User, 'passwordHash'>; token: string } {
    const user = this.userRepo.findByEmail(email);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new Error('Invalid email or password');
    }

    const token = this.generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    return { user: user.toJSON(), token };
  }

  public generateToken(payload: AuthTokenPayload): string {
    return jwt.sign(payload, config.jwtSecret, { expiresIn: '24h' });
  }

  public verifyToken(token: string): AuthTokenPayload {
    return jwt.verify(token, config.jwtSecret) as AuthTokenPayload;
  }
}
