import express, { Application } from 'express';
import { mainRouter } from '@/routes/index';
import { requestLogger } from '@/middleware/logger.middleware';
import { errorHandler } from '@/middleware/error.middleware';

export function createApp(): Application {
  const app: Application = express();

  app.use(express.json());
  app.use(requestLogger);
  app.use('/api', mainRouter);
  app.use(errorHandler);

  return app;
}
