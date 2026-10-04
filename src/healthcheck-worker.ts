// Healthcheck do container do worker: saudável se a batida gravada pelo
// próprio worker tem menos de 5 min (mesmo limite da Saúde dos dados).
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
prisma.workerHeartbeat
  .findUnique({ where: { nome: 'worker' } })
  .then((b) => process.exit(b && Date.now() - b.ultimoEm.getTime() < 5 * 60_000 ? 0 : 1))
  .catch(() => process.exit(1));
