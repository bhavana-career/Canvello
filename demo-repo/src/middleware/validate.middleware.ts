import { Request, Response, NextFunction } from 'express';
import { validateEmail, validatePassword, validateRequired } from '@/utils/validator';

export function validateRegisterBody(req: Request, res: Response, next: NextFunction): void {
  const { email, password, name } = req.body;
  if (!validateRequired(name)) {
    res.status(400).json({ error: 'Name is required' });
    return;
  }
  if (!validateEmail(email)) {
    res.status(400).json({ error: 'Valid email is required' });
    return;
  }
  if (!validatePassword(password)) {
    res.status(400).json({ error: 'Password must be at least 6 characters' });
    return;
  }
  next();
}

export function validateLoginBody(req: Request, res: Response, next: NextFunction): void {
  const { email, password } = req.body;
  if (!validateEmail(email) || !validateRequired(password)) {
    res.status(400).json({ error: 'Valid email and password are required' });
    return;
  }
  next();
}
