// Resolução da loja no login/ativação (Fase 1, D8 — auditoria §22 achado B).
//
// Antes: `findFirst({ codigoErp })` SEM empresa — com duas empresas usando o
// mesmo código (permitido: o código é único POR empresa), a loja escolhida era
// arbitrária. Agora:
//   - `lojaId` (UUID, globalmente único) é a forma preferida — o app envia;
//   - `codigoErpLoja` só é aceito se identificar UMA loja ativa no sistema;
//     ambíguo = recusado (erro genérico, nunca escolhe por conta própria).
import { prisma } from '../db';

export async function resolverLojaDeLogin(p: { lojaId?: string; codigoErpLoja?: string }) {
  if (p.lojaId) return prisma.loja.findFirst({ where: { id: p.lojaId, ativa: true } });
  if (!p.codigoErpLoja) return null;
  const lojas = await prisma.loja.findMany({ where: { codigoErp: p.codigoErpLoja, ativa: true }, take: 2 });
  return lojas.length === 1 ? lojas[0] : null;
}
