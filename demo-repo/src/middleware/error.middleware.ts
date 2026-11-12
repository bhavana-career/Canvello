import { Request, Response, NextFunction } from 'express';
import { logger } from '@/utils/logger';

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction): void {
  logger.error(`Unhandled error at ${req.method} ${req.url}:`, err);
  const status = err.status || 400;
  res.status(status).json({
    error: err.message || 'Internal server error',
  });
}
