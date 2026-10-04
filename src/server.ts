import { env } from './config'; // primeira linha: valida .env antes de qualquer outra coisa
import { app } from './app';
import { logger } from './utils/logger';

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, modulosLegados: env.MODULOS_LEGADOS_ATIVOS }, `${env.APP_NAME} escutando`);
});
