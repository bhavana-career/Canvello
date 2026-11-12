import { Request, Response, NextFunction } from 'express';
import { UserService } from '@/services/user.service';

const userService = new UserService();

export class UserController {
  public static async getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const user = userService.getUserById(userId);
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      res.json(user);
    } catch (err) {
      next(err);
    }
  }

  public static async listUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const users = userService.listUsers();
      res.json(users);
    } catch (err) {
      next(err);
    }
  }
}
