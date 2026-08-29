import { env } from './config'; // primeira linha: valida .env antes de qualquer outra coisa
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { logger } from './utils/logger';
import { healthRouter } from './routes/health';
import { authRouter } from './routes/auth';
import { metasRouter } from './routes/metas';
import { apiRateLimit } from './middlewares/ratelimit';
import { errorHandler } from './middlewares/error-handler';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(pinoHttp({ logger }));
app.use(apiRateLimit);

app.use(healthRouter);
app.use(authRouter);
app.use(metasRouter);

app.use(errorHandler);

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, erpMode: env.ERP_MODE }, `${env.APP_NAME} escutando`);
});
