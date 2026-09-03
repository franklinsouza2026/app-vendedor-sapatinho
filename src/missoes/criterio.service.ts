// Avaliação de critérios de missão/desafio (Fatia 7, seção 10 — "regra de
// ouro"): SEMPRE evidência real do sistema (ledger/AcademyProgress/
// SimulationSession/StreakVendedor já existentes) — NUNCA um cálculo próprio
// que decida "atingiu" fora do que o motor/serviço original já decidiu.
// `recomputarBaselines`/`realizadoNoPeriodo` são usados só pra formatar o
// progresso (números que a Home já mostra), nunca pra decidir conclusão.
import { CriterioMissao } from '@prisma/client';
import { prisma } from '../db';
import { env } from '../config';
import { dataISO, inicioDoDia, metaDoPeriodo, realizadoNoPeriodo } from '../services/metas.service';
import { recomputarBaselines, deltaPercentual } from '../gamificacao/baseline.service';
import { LIMIAR_MELHORA_PCT } from '../gamificacao/motor.service';
import { ResultadoCriterio } from './tipos';

export async function avaliarCriterio(
  criterionType: CriterioMissao,
  vendedorId: string,
  janela: { inicio: Date; fim: Date }
): Promise<ResultadoCriterio> {
  switch (criterionType) {
    case 'DAILY_GOAL':
      return avaliarMetaDiaria(vendedorId, janela.inicio);
    case 'PA_IMPROVEMENT':
      return avaliarMelhoraPa(vendedorId, janela.inicio);
    case 'TICKET_IMPROVEMENT':
      return avaliarMelhoraTicket(vendedorId, janela.inicio);
    case 'COMPLETE_LESSON':
      return avaliarAulaConcluida(vendedorId, janela.inicio);
    case 'PASS_QUIZ':
      return avaliarQuizAprovado(vendedorId, janela.inicio);
    case 'COMPLETE_SIMULATION':
      return avaliarSimulacaoConcluida(vendedorId, janela.inicio);
    case 'STREAK_3':
      return avaliarStreak(vendedorId, 3);
    case 'RECOGNITION_CREATED':
      return avaliarReconhecimentoCriado(vendedorId, janela.inicio);
    case 'ONE_ON_ONE_COMPLETED':
      return avaliarOneOnOneConcluido(vendedorId, janela.inicio);
    case 'PDI_REVIEWED':
      return avaliarPdiRevisado(vendedorId, janela.inicio);
  }
}

// ===== Critérios gerenciais (Fatia 9.6, seção 44) — sempre evidência real
// de uma ação já registrada por outro motor (Recognition/OneOnOne/
// ManagerAssessment), nunca um client-side complete=true. =====

async function avaliarReconhecimentoCriado(vendedorId: string, desde: Date): Promise<ResultadoCriterio> {
  const reconhecimento = await prisma.recognition.findFirst({ where: { authorId: vendedorId, createdAt: { gte: desde } } });
  return { atingido: !!reconhecimento, progressoAtual: reconhecimento ? 1 : 0, progressoAlvo: 1 };
}

async function avaliarOneOnOneConcluido(vendedorId: string, desde: Date): Promise<ResultadoCriterio> {
  const encontro = await prisma.oneOnOne.findFirst({ where: { managerId: vendedorId, status: 'COMPLETED', completedAt: { gte: desde } } });
  return { atingido: !!encontro, progressoAtual: encontro ? 1 : 0, progressoAlvo: 1 };
}

async function avaliarPdiRevisado(vendedorId: string, desde: Date): Promise<ResultadoCriterio> {
  const avaliacao = await prisma.managerAssessment.findFirst({ where: { authorId: vendedorId, createdAt: { gte: desde } } });
  return { atingido: !!avaliacao, progressoAtual: avaliacao ? 1 : 0, progressoAlvo: 1 };
}

async function avaliarMetaDiaria(vendedorId: string, dia: Date): Promise<ResultadoCriterio> {
  const diaNormalizado = inicioDoDia(dia);
  const ds = dataISO(diaNormalizado);
  const referenciaId = `${vendedorId}:${ds}:100`;

  const [meta, realizado, transacoes] = await Promise.all([
    metaDoPeriodo(vendedorId, 'FATURAMENTO', 'DIA', diaNormalizado),
    realizadoNoPeriodo(vendedorId, diaNormalizado, new Date()),
    prisma.moedaTransacao.findMany({ where: { referenciaTipo: 'META_DIARIA_TIER', referenciaId } }),
  ]);

  const saldoLiquido = transacoes.reduce((acc, t) => acc + t.valor, 0);

  return {
    atingido: saldoLiquido > 0,
    progressoAtual: realizado.faturamento,
    progressoAlvo: meta ?? 0,
  };
}

async function avaliarMelhoraPa(vendedorId: string, dia: Date): Promise<ResultadoCriterio> {
  const diaNormalizado = inicioDoDia(dia);
  const ds = dataISO(diaNormalizado);

  const [realizado, baselines, jaConcedido] = await Promise.all([
    realizadoNoPeriodo(vendedorId, diaNormalizado, new Date()),
    recomputarBaselines(vendedorId, diaNormalizado),
    prisma.moedaTransacao.findUnique({ where: { idempotencyKey: `melhora-pa-${vendedorId}-${ds}` } }),
  ]);

  const baseline = baselines.find((b) => b.metrica === 'PA')!;
  const alvo = baseline.amostraSuficiente && baseline.valor !== null ? baseline.valor * (1 + LIMIAR_MELHORA_PCT / 100) : 0;

  return { atingido: !!jaConcedido, progressoAtual: realizado.pa, progressoAlvo: alvo };
}

async function avaliarMelhoraTicket(vendedorId: string, dia: Date): Promise<ResultadoCriterio> {
  const diaNormalizado = inicioDoDia(dia);
  const ds = dataISO(diaNormalizado);

  const [realizado, baselines, jaConcedido] = await Promise.all([
    realizadoNoPeriodo(vendedorId, diaNormalizado, new Date()),
    recomputarBaselines(vendedorId, diaNormalizado),
    prisma.moedaTransacao.findUnique({ where: { idempotencyKey: `melhora-ticket-${vendedorId}-${ds}` } }),
  ]);

  const baseline = baselines.find((b) => b.metrica === 'TICKET_MEDIO')!;
  const alvo = baseline.amostraSuficiente && baseline.valor !== null ? baseline.valor * (1 + LIMIAR_MELHORA_PCT / 100) : 0;

  return { atingido: !!jaConcedido, progressoAtual: realizado.ticketMedio, progressoAlvo: alvo };
}

async function avaliarAulaConcluida(vendedorId: string, desde: Date): Promise<ResultadoCriterio> {
  const concluida = await prisma.academyProgress.findFirst({
    where: { vendedorId, status: 'COMPLETED', completedAt: { gte: desde } },
  });
  return { atingido: !!concluida, progressoAtual: concluida ? 1 : 0, progressoAlvo: 1 };
}

async function avaliarQuizAprovado(vendedorId: string, desde: Date): Promise<ResultadoCriterio> {
  const aprovado = await prisma.academyProgress.findFirst({
    where: { vendedorId, quizPassed: true, updatedAt: { gte: desde } },
  });
  return { atingido: !!aprovado, progressoAtual: aprovado ? 1 : 0, progressoAlvo: 1 };
}

async function avaliarSimulacaoConcluida(vendedorId: string, desde: Date): Promise<ResultadoCriterio> {
  const concluida = await prisma.simulationSession.findFirst({
    where: {
      vendedorId,
      status: 'EVALUATED',
      evaluatedAt: { gte: desde },
      turnCount: { gte: env.SIMULATION_MIN_TURNS_FOR_REWARD },
    },
  });
  return { atingido: !!concluida, progressoAtual: concluida ? 1 : 0, progressoAlvo: 1 };
}

async function avaliarStreak(vendedorId: string, alvo: number): Promise<ResultadoCriterio> {
  const streak = await prisma.streakVendedor.findUnique({ where: { vendedorId } });
  const atual = streak?.streakAtual ?? 0;
  return { atingido: atual >= alvo, progressoAtual: atual, progressoAlvo: alvo };
}

/** Progresso de um desafio semanal — mesma disciplina: só conta o que já existe nas tabelas reais. */
export async function avaliarCriterioDesafio(
  criterionType: string,
  vendedorId: string,
  alvo: number,
  desde: Date
): Promise<ResultadoCriterio> {
  switch (criterionType) {
    case '3_SIMULATIONS_WEEK': {
      const count = await prisma.simulationSession.count({
        where: { vendedorId, status: 'EVALUATED', evaluatedAt: { gte: desde }, turnCount: { gte: env.SIMULATION_MIN_TURNS_FOR_REWARD } },
      });
      return { atingido: count >= alvo, progressoAtual: count, progressoAlvo: alvo };
    }
    case '3_LESSONS_WEEK': {
      const count = await prisma.academyProgress.count({ where: { vendedorId, status: 'COMPLETED', completedAt: { gte: desde } } });
      return { atingido: count >= alvo, progressoAtual: count, progressoAlvo: alvo };
    }
    case '5_DAYS_CONSISTENCY': {
      const count = await prisma.streakChecagem.count({ where: { vendedorId, atingiu: true, data: { gte: desde } } });
      return { atingido: count >= alvo, progressoAtual: count, progressoAlvo: alvo };
    }
    default:
      return { atingido: false, progressoAtual: 0, progressoAlvo: alvo };
  }
}
