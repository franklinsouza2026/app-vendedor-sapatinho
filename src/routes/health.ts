import { Router } from 'express';
import { prisma } from '../db';
import { connection } from '../queues/connection';

export const healthRouter = Router();

healthRouter.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

healthRouter.get('/health/deep', async (_req, res) => {
  const checks: Record<string, boolean> = {};

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = true;
  } catch {
    checks.database = false;
  }

  try {
    checks.redis = connection.status === 'ready' || (await connection.ping()) === 'PONG';
  } catch {
    checks.redis = false;
  }

  const ok = Object.values(checks).every(Boolean);
  res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'degraded', checks });
});
