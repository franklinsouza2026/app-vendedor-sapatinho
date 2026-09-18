// App Express separado do entrypoint HTTP (server.ts) pra poder ser
// importado em testes de integração de rota (supertest) sem abrir uma porta real.
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env } from './config';
import { logger } from './utils/logger';
import { healthRouter } from './routes/health';
import { authRouter } from './routes/auth';
import { metasRouter } from './routes/metas';
import { gamificacaoRouter } from './routes/gamificacao';
import { coachRouter } from './routes/coach';
import { treinadorRouter } from './routes/treinador';
import { playbookRouter } from './routes/playbook';
import { simuladorRouter } from './routes/simulador';
import { academiaRouter } from './routes/academia';
import { missoesRouter } from './routes/missoes';
import { adminRouter } from './routes/admin';
import { adminMetasRouter } from './routes/admin-metas';
import { adminAiRouter } from './routes/admin-ai';
import { adminTrainingRouter } from './routes/admin-training';
import { adminTrainingAiRouter } from './routes/admin-training-ai';
import { universidadeSellerRouter } from './routes/universidade-seller';
import { universidadeManagerRouter } from './routes/universidade-manager';
import { universidadeAdminRouter } from './routes/universidade-admin';
import { competicoesSellerRouter } from './routes/competicoes-seller';
import { competicoesManagerRouter } from './routes/competicoes-manager';
import { competicoesAdminRouter } from './routes/competicoes-admin';
import { managerPanelRouter } from './routes/manager-panel';
import { managerPanelAdminRouter } from './routes/manager-panel-admin';
import { apiRateLimit } from './middlewares/ratelimit';
import { errorHandler } from './middlewares/error-handler';

export const app = express();

// Confiança em proxy (Fatia 9.7) — número explícito de hops, nunca `true`.
// Com `true`, qualquer cliente poderia forjar X-Forwarded-For e escapar do
// rate limit; com 0 (padrão local) o Express usa o IP da conexão direta.
app.set('trust proxy', env.TRUST_PROXY_HOPS);

app.use(helmet());

// CORS por allowlist (Fatia 9.7). Sem CORS_ORIGINS definido, mantém o
// comportamento aberto de dev.
const origensPermitidas = env.CORS_ORIGINS.split(',')
  .map((o) => o.trim())
  .filter(Boolean);

// Produção nunca deve aceitar origem arbitrária: falha no boot em vez de subir
// silenciosamente com CORS aberto. A checagem vive AQUI, não em `config.ts`,
// porque só o processo que serve HTTP tem CORS — o worker compartilha o mesmo
// config e não deve morrer por falta de uma configuração que não usa.
if (env.NODE_ENV === 'production' && origensPermitidas.length === 0) {
  logger.fatal('NODE_ENV=production exige CORS_ORIGINS (lista de origens separadas por vírgula)');
  process.exit(1);
}
app.use(cors(origensPermitidas.length > 0 ? { origin: origensPermitidas, credentials: true } : {}));

app.use(express.json());
app.use(pinoHttp({ logger }));
app.use(apiRateLimit);

app.use(healthRouter);
app.use(authRouter);
app.use(metasRouter);
app.use(gamificacaoRouter);
app.use(coachRouter);
app.use(treinadorRouter);
app.use(playbookRouter);
app.use(simuladorRouter);
app.use(academiaRouter);
app.use(missoesRouter);
app.use(adminRouter);
app.use(adminMetasRouter);
app.use(adminAiRouter);
app.use(adminTrainingRouter);
app.use(adminTrainingAiRouter);
app.use(universidadeSellerRouter);
app.use(universidadeManagerRouter);
app.use(universidadeAdminRouter);
app.use(competicoesSellerRouter);
app.use(competicoesManagerRouter);
app.use(competicoesAdminRouter);
app.use(managerPanelRouter);
app.use(managerPanelAdminRouter);

app.use(errorHandler);
