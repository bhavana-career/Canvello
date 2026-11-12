import { Router } from 'express';
import { UserController } from '@/controllers/user.controller';
import { requireAuth } from '@/middleware/auth.middleware';

export const userRouter = Router();

userRouter.use(requireAuth);
userRouter.get('/profile', UserController.getProfile);
userRouter.get('/list', UserController.listUsers);
