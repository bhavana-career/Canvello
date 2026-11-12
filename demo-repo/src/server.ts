import { createApp } from '@/app';
import { config } from '@/config/index';
import { logger } from '@/utils/logger';

const app = createApp();

app.listen(config.port, () => {
  logger.info(`Canvello Demo Server running on http://localhost:${config.port}`);
});
