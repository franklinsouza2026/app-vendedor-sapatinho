/**
 * Eventos de ENGAJAMENTO — ações relevantes registradas no servidor quando
 * a ação de fato acontece (missão concluída, aula concluída, quiz aprovado,
 * simulação concluída…). Nunca um evento enviado pelo cliente.
 *
 * Best-effort: falhar ao registrar engajamento NUNCA quebra a ação principal
 * do vendedor. Idempotente por `chave` (tipo + vendedor + referência): reprocessar a
 * mesma conclusão não infla a contagem.
 *
 * Fora de propósito: conversa com o Conselheiro (Constituição §12).
 */
import { Prisma, TipoEventoEngajamento } from '@prisma/client';
import { prisma } from '../db';
import { createLogger } from '../utils/logger';
import { diaLocal, paraDate } from './dia';

const log = createLogger('engajamento:eventos');

export async function registrarEventoEngajamento(params: { vendedorId: string; tipo: TipoEventoEngajamento; referenciaTipo: string; referenciaId: string; metadata?: Record<string, string | number | boolean | null>; agora?: Date }) {
  try {
    const agora = params.agora ?? new Date();
    const v = await prisma.vendedor.findUnique({ where: { id: params.vendedorId }, select: { empresaId: true, lojaId: true, papel: true, loja: { select: { empresa: { select: { timezone: true } } } } } });
    if (!v || v.papel !== 'VENDEDOR') return;
    await prisma.eventoEngajamento.createMany({
      data: [
        {
          empresaId: v.empresaId,
          lojaId: v.lojaId,
          vendedorId: params.vendedorId,
          tipo: params.tipo,
          referenciaTipo: params.referenciaTipo,
          referenciaId: params.referenciaId,
          metadata: params.metadata as Prisma.InputJsonValue | undefined,
          dia: paraDate(diaLocal(agora, v.loja.empresa.timezone)),
          ocorridoEm: agora,
          // Inclui o vendedor: aula/quiz são de CATÁLOGO (mesmo id para todos).
          chave: `${params.tipo}:${params.vendedorId}:${params.referenciaTipo}:${params.referenciaId}`,
        },
      ],
      skipDuplicates: true,
    });
  } catch (err) {
    log.error({ err, vendedorId: params.vendedorId, tipo: params.tipo }, 'falha ao registrar evento de engajamento — ação principal segue');
  }
}
