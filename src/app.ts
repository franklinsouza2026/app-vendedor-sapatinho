// App Express separado do entrypoint HTTP (server.ts) pra poder ser
// importado em testes de integração de rota (supertest) sem abrir uma porta real.
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { logger } from './utils/logger';
import { healthRouter } from './routes/health';
import { authRouter } from './routes/auth';
import { metasRouter } from './routes/metas';
import { gamificacaoRouter } from './routes/gamificacao';
import { coachRouter } from './routes/coach';
import { apiRateLimit } from './middlewares/ratelimit';
import { errorHandler } from './middlewares/error-handler';

export const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(pinoHttp({ logger }));
app.use(apiRateLimit);

app.use(healthRouter);
app.use(authRouter);
app.use(metasRouter);
app.use(gamificacaoRouter);
app.use(coachRouter);

app.use(errorHandler);
