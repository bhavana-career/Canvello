import { Router } from 'express';
import { AuthController } from '@/controllers/auth.controller';
import { validateRegisterBody, validateLoginBody } from '@/middleware/validate.middleware';

export const authRouter = Router();

authRouter.post('/register', validateRegisterBody, AuthController.register);
authRouter.post('/login', validateLoginBody, AuthController.login);
