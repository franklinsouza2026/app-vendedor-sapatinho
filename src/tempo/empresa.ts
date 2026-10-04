// Fuso da empresa (Empresa.timezone) com cache curto — consultado em quase
// todo cálculo de dia. Mudança de fuso é rara e administrativa; 5 min de
// cache é seguro.
import { prisma } from '../db';
import { TZ_PADRAO } from './dia';

const cache = new Map<string, { tz: string; ate: number }>();
const TTL_MS = 5 * 60 * 1000;

export async function timezoneDaEmpresa(empresaId: string): Promise<string> {
  const agora = Date.now();
  const emCache = cache.get(empresaId);
  if (emCache && emCache.ate > agora) return emCache.tz;
  const empresa = await prisma.empresa.findUnique({ where: { id: empresaId }, select: { timezone: true } });
  const tz = empresa?.timezone ?? TZ_PADRAO;
  cache.set(empresaId, { tz, ate: agora + TTL_MS });
  return tz;
}

/** Só para testes que mudam o fuso de uma empresa. */
export function limparCacheTimezone() {
  cache.clear();
}
