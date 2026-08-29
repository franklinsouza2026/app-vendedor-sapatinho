import { env } from './config'; // primeira linha: valida .env antes de qualquer outra coisa
import { app } from './app';
import { logger } from './utils/logger';

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, erpMode: env.ERP_MODE }, `${env.APP_NAME} escutando`);
});
