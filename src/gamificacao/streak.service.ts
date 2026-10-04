// Streak (seção 19 da fonte de verdade). v1 (decisão explícita, documentada em
// 05-Decisoes-e-Tradeoffs.md): streak só avalia DIAS FECHADOS (nunca o dia
// corrente), pra evitar contagem instável indo e vindo por causa de resync
// intraday. O app pode mostrar o streak como "dias fechados consecutivos";
// mostrar o dia corrente ao vivo fica pra quando houver semântica de
// escala/expediente (fora do escopo desta fatia).
//
// Dia "sem meta cadastrada" é tratado como neutro (não quebra, não conta) —
// nunca inferimos presença/ausência sem fonte confiável (seção 19).
//
// Fase 1 (convergência, D4): este fechamento continua registrando
// StreakChecagem/StreakVendedor (consumidos pelo score de consistência e pela
// elegibilidade de competições), mas NÃO concede mais XP/VendaCoins/badge. A
// recompensa de sequência é derivada dos fatos pelo motor único de
// reconciliação (src/fase1/reconciliacao/motor.ts), que também a desfaz se um
// cancelamento quebrar a sequência — duas fontes pagando o mesmo limiar seria
// recompensa em dobro.
import { prisma } from '../db';
import { inicioDoDia, metaDoPeriodo, realizadoNoPeriodo } from '../services/metas.service';
import { createLogger } from '../utils/logger';

const log = createLogger('gamificacao:streak');

function fimDoDia(dia: Date): Date {
  return new Date(dia.getTime() + 24 * 3600 * 1000 - 1);
}

export interface ResultadoFechamento {
  avaliado: boolean;
  motivo?: string;
  atingiu?: boolean;
  streakAtual?: number;
}

/**
 * Fecha o dia `dia` (deve ser um dia já passado, não hoje) pro vendedor:
 * atualiza o streak e concede XP/moeda/badge nos limiares. Idempotente via
 * StreakChecagem — reprocessar o mesmo dia não duplica nem reconta.
 */
export async function avaliarFechamentoDia(vendedorId: string, dia: Date): Promise<ResultadoFechamento> {
  const diaNormalizado = inicioDoDia(dia);
  const tipo = 'META_DIARIA';

  const jaChecado = await prisma.streakChecagem.findUnique({
    where: { vendedorId_tipo_data: { vendedorId, tipo, data: diaNormalizado } },
  });
  if (jaChecado) {
    return { avaliado: false, motivo: 'dia já fechado anteriormente (idempotente)' };
  }

  const meta = await metaDoPeriodo(vendedorId, 'FATURAMENTO', 'DIA', diaNormalizado);
  if (meta === null || meta <= 0) {
    return { avaliado: false, motivo: 'sem meta cadastrada nesse dia — tratado como neutro' };
  }

  const vendedor = await prisma.vendedor.findUniqueOrThrow({ where: { id: vendedorId } });

  const realizado = await realizadoNoPeriodo(vendedorId, diaNormalizado, fimDoDia(diaNormalizado));
  const percentualMeta = (realizado.faturamento / meta) * 100;
  const atingiu = percentualMeta >= 100;

  await prisma.streakChecagem.create({
    data: { vendedorId, tipo, data: diaNormalizado, atingiu },
  });

  const streakExistente = await prisma.streakVendedor.findUnique({ where: { vendedorId } });

  if (!atingiu) {
    if (streakExistente) {
      await prisma.streakVendedor.update({ where: { vendedorId }, data: { streakAtual: 0 } });
    }
    return { avaliado: true, atingiu: false, streakAtual: 0 };
  }

  // Continua a sequência se não houver NENHUM dia com meta batida=false entre a
  // última contagem (exclusive) e hoje (exclusive). Dias "sem meta cadastrada"
  // nunca geram StreakChecagem, então simplesmente não aparecem aqui — são
  // neutros por omissão, não quebram a sequência (ver comentário no topo do arquivo).
  let continuaSequencia = false;
  if (streakExistente?.ultimaDataContada) {
    const falhasNoIntervalo = await prisma.streakChecagem.count({
      where: {
        vendedorId,
        tipo,
        atingiu: false,
        data: { gt: inicioDoDia(streakExistente.ultimaDataContada), lt: diaNormalizado },
      },
    });
    continuaSequencia = falhasNoIntervalo === 0;
  }

  const novoStreak = continuaSequencia ? streakExistente!.streakAtual + 1 : 1;
  const novoMaior = Math.max(novoStreak, streakExistente?.maiorStreak ?? 0);

  await prisma.streakVendedor.upsert({
    where: { vendedorId },
    create: {
      empresaId: vendedor.empresaId,
      lojaId: vendedor.lojaId,
      vendedorId,
      tipo,
      streakAtual: novoStreak,
      maiorStreak: novoMaior,
      ultimaDataContada: diaNormalizado,
    },
    update: { streakAtual: novoStreak, maiorStreak: novoMaior, ultimaDataContada: diaNormalizado },
  });

  log.debug({ vendedorId, streak: novoStreak }, 'dia fechado na sequência legada');

  return { avaliado: true, atingiu: true, streakAtual: novoStreak };
}
