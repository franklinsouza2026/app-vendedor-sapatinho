// Trava de sincronização por integração (Linx L2): só uma execução por vez,
// entre processos/workers. É uma "lease" no próprio registro da integração,
// adquirida por UPDATE condicional (atômico) e que expira sozinha — se o
// processo cair, a próxima execução assume depois do prazo. Mesmo que duas
// execuções se sobreponham (lease vencida), a ingestão é idempotente e o
// cursor só avança para frente: a trava evita trabalho dobrado, a correção
// não depende dela.
import { randomUUID } from 'node:crypto';
import { prisma } from '../../db';
import { env } from '../../config';

export async function adquirirTrava(integracaoId: string, agora = new Date(), minutos = env.ERP_SYNC_TRAVA_MINUTOS): Promise<string | null> {
  const dono = randomUUID();
  const ate = new Date(agora.getTime() + minutos * 60_000);
  const r = await prisma.integracao.updateMany({
    where: { id: integracaoId, OR: [{ syncTravadaAte: null }, { syncTravadaAte: { lt: agora } }] },
    data: { syncTravadaAte: ate, syncTravadaPor: dono },
  });
  return r.count === 1 ? dono : null;
}

export async function liberarTrava(integracaoId: string, dono: string) {
  await prisma.integracao.updateMany({ where: { id: integracaoId, syncTravadaPor: dono }, data: { syncTravadaAte: null, syncTravadaPor: null } });
}
