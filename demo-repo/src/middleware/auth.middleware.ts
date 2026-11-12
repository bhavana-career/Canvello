import { Request, Response, NextFunction } from 'express';
import { AuthService } from '@/services/auth.service';
import { AuthTokenPayload } from '@/types/index';

declare global {
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
    }
  }
}

const authService = new AuthService();

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
    return;
  }

  const token = authHeader.substring(7);
  try {
    const payload = authService.verifyToken(token);
    req.user = payload;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
}
