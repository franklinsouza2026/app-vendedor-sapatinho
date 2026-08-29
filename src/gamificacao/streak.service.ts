// Streak (seção 19 da fonte de verdade). v1 (decisão explícita, documentada em
// 05-Decisoes-e-Tradeoffs.md): streak só avalia DIAS FECHADOS (nunca o dia
// corrente), pra evitar contagem instável indo e vindo por causa de resync
// intraday. O app pode mostrar o streak como "dias fechados consecutivos";
// mostrar o dia corrente ao vivo fica pra quando houver semântica de
// escala/expediente (fora do escopo desta fatia).
//
// Dia "sem meta cadastrada" é tratado como neutro (não quebra, não conta) —
// nunca inferimos presença/ausência sem fonte confiável (seção 19).
import { prisma } from '../db';
import { dataISO, inicioDoDia, metaDoPeriodo, realizadoNoPeriodo } from '../services/metas.service';
import { getRegraAtiva } from './regras.service';
import { concederMoeda, concederXp } from './ledger.service';
import { concederBadge } from './badges.service';
import { TipoEventoGamificacao } from '@prisma/client';
import { createLogger } from '../utils/logger';

const log = createLogger('gamificacao:streak');

const LIMIARES: { valor: number; evento: TipoEventoGamificacao }[] = [
  { valor: 3, evento: 'STREAK_3' },
  { valor: 5, evento: 'STREAK_5' },
  { valor: 10, evento: 'STREAK_10' },
];

function fimDoDia(dia: Date): Date {
  const proximo = new Date(dia);
  proximo.setDate(proximo.getDate() + 1);
  return new Date(proximo.getTime() - 1);
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
  // Falha rápido ANTES de qualquer escrita: se a empresa não tiver regra ativa,
  // não podemos deixar StreakChecagem/StreakVendedor já gravados — isso marcaria
  // o dia como "fechado" pra sempre sem nunca conceder o XP/moeda do limiar.
  const regra = await getRegraAtiva(vendedor.empresaId);

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

  const ds = dataISO(diaNormalizado);

  const limiarAtingido = LIMIARES.find((l) => l.valor === novoStreak);
  if (limiarAtingido) {
    const idemKey = `streak-${limiarAtingido.valor}-${vendedorId}-${ds}`;
    const ctx = {
      empresaId: vendedor.empresaId,
      lojaId: vendedor.lojaId,
      vendedorId,
      tipoEvento: limiarAtingido.evento,
      referenciaTipo: 'STREAK',
      idempotencyKey: idemKey,
      regraVersao: regra.versao,
      ocorridoEm: diaNormalizado,
    };
    const xp = regra.regrasXp[limiarAtingido.evento] ?? 0;
    const moeda = regra.regrasMoeda[limiarAtingido.evento] ?? 0;
    if (xp > 0) await concederXp(ctx, xp);
    if (moeda > 0) await concederMoeda(ctx, moeda);
    log.info({ vendedorId, streak: novoStreak }, 'limiar de streak atingido');
  }

  if (novoStreak === 7) {
    await concederBadge(vendedor.empresaId, vendedor.lojaId, vendedorId, 'STREAK_7', `badge-streak-7-${vendedorId}`);
  }

  return { avaliado: true, atingiu: true, streakAtual: novoStreak };
}
