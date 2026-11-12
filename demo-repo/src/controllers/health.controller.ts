import { Request, Response } from 'express';
import { getDatabase } from '@/config/database';

export class HealthController {
  public static check(req: Request, res: Response): void {
    try {
      const db = getDatabase();
      db.prepare('SELECT 1').get();
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        database: 'connected',
      });
    } catch (err: any) {
      res.status(503).json({
        status: 'unhealthy',
        error: err.message,
      });
    }
  }
}
