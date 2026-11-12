import { Router } from 'express';
import { authRouter } from '@/routes/auth.routes';
import { userRouter } from '@/routes/user.routes';
import { itemRouter } from '@/routes/item.routes';
import { healthRouter } from '@/routes/health.routes';

export const mainRouter = Router();

mainRouter.use('/auth', authRouter);
mainRouter.use('/users', userRouter);
mainRouter.use('/items', itemRouter);
mainRouter.use('/health', healthRouter);
