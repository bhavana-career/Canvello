import { Request, Response, NextFunction } from 'express';
import { AuthService } from '@/services/auth.service';

const authService = new AuthService();

export class AuthController {
  public static async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password, name } = req.body;
      const result = authService.register(email, password, name);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }

  public static async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password } = req.body;
      const result = authService.login(email, password);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
}
