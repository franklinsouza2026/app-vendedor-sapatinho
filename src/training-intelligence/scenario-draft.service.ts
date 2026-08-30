// Lifecycle do TrainingScenarioDraft (seção 24/25/66) — mesma disciplina de
// transição atômica do CMS manual (Fatia 7.5C), nunca um atalho. Publicar
// copia os campos aprovados pra um SimulationScenario REAL (catálogo ativo
// do Simulador) — nunca o inverso, e nunca sem passar por
// DRAFT→REVIEW_PENDING→APPROVED→PUBLISHED primeiro.
import { randomUUID } from 'node:crypto';
import { StatusConteudo } from '@prisma/client';
import { prisma } from '../db';
import { registrarEventoAuditoria } from '../identidade/auditoria.service';
import { TrainingIntelligenceError } from './types';

const TRANSICOES: Record<'submeter' | 'aprovar' | 'publicar' | 'arquivar', { de: StatusConteudo[]; para: StatusConteudo }> = {
  submeter: { de: ['DRAFT'], para: 'REVIEW_PENDING' },
  aprovar: { de: ['REVIEW_PENDING'], para: 'APPROVED' },
  publicar: { de: ['APPROVED'], para: 'PUBLISHED' },
  arquivar: { de: ['DRAFT', 'REVIEW_PENDING', 'APPROVED', 'PUBLISHED'], para: 'ARCHIVED' },
};

export async function listarCenariosDraft(empresaId: string) {
  return prisma.trainingScenarioDraft.findMany({ where: { empresaId }, orderBy: { createdAt: 'desc' } });
}

export async function transicionarCenarioDraft(id: string, empresaId: string, transicao: keyof typeof TRANSICOES, actorId: string) {
  const regra = TRANSICOES[transicao];
  const atual = await prisma.trainingScenarioDraft.findFirst({ where: { id, empresaId } });
  if (!atual) throw new TrainingIntelligenceError('not_found', 'cenário de simulação não encontrado');

  // "Publicar" não é só uma troca de status — materializa um SimulationScenario
  // real (catálogo ativo do Simulador), nunca dá pra fazer só com updateMany.
  // Criação do cenário real + transição condicional andam na MESMA transação
  // (achado de segurança da Fatia 7.5D): sem isso, 2 publicações concorrentes
  // (double-click/retry) passavam ambas pelo `if (atual.status !== 'APPROVED')`
  // antes de qualquer uma commitar, cada uma criando seu próprio
  // SimulationScenario — só uma delas "vencia" o updateMany condicional, mas
  // o SimulationScenario órfão da perdedora ficava live no catálogo do
  // Simulador mesmo assim, nunca revertido.
  if (transicao === 'publicar') {
    if (atual.status !== 'APPROVED') {
      throw new TrainingIntelligenceError('invalid_transition', `cenário não está em um estado válido para publicar (estado atual: ${atual.status})`);
    }
    const cenarioReal = await prisma.$transaction(async (tx) => {
      const resultado = await tx.trainingScenarioDraft.updateMany({
        where: { id, empresaId, status: 'APPROVED' },
        data: { status: 'PUBLISHED', approvedBy: actorId },
      });
      if (resultado.count !== 1) throw new TrainingIntelligenceError('invalid_transition', 'cenário mudou de estado durante a publicação');

      const criado = await tx.simulationScenario.create({
        data: {
          code: `ia-${atual.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}-${randomUUID().slice(0, 8)}`,
          title: atual.title,
          description: atual.context,
          category: 'GERAL',
          objective: atual.sellerObjective,
          playbookCategorias: [],
          criteriosAvaliacao: atual.evaluationCriteria as string[],
          personasPorDificuldade: {
            EASY: { profile: atual.customerProfile, initialNeed: atual.sellerObjective, hiddenNeeds: [], objections: (atual.objections as string[]).slice(0, 1), behavior: atual.customerProfile },
            MEDIUM: { profile: atual.customerProfile, initialNeed: atual.sellerObjective, hiddenNeeds: [], objections: atual.objections as string[], behavior: atual.customerProfile },
            HARD: { profile: atual.customerProfile, initialNeed: atual.sellerObjective, hiddenNeeds: [], objections: atual.objections as string[], behavior: atual.customerProfile },
          },
        },
      });
      await tx.trainingScenarioDraft.update({ where: { id }, data: { publishedScenarioId: criado.id } });
      return criado;
    });

    await registrarEventoAuditoria({ empresaId, acao: 'AI_CONTENT_PUBLISHED', actorId, metadata: { scenarioId: id, tipo: 'scenario', simulationScenarioId: cenarioReal.id } });
    return prisma.trainingScenarioDraft.findUniqueOrThrow({ where: { id } });
  }

  const resultado = await prisma.trainingScenarioDraft.updateMany({
    where: { id, empresaId, status: { in: regra.de } },
    data: { status: regra.para },
  });
  if (resultado.count !== 1) {
    throw new TrainingIntelligenceError('invalid_transition', `cenário não está em um estado válido para "${transicao}" (estado atual: ${atual.status})`);
  }

  const acaoPorTransicao = { submeter: 'CONTENT_SUBMITTED_FOR_REVIEW', aprovar: 'CONTENT_APPROVED', arquivar: 'CONTENT_ARCHIVED' } as const;
  await registrarEventoAuditoria({ empresaId, acao: acaoPorTransicao[transicao], actorId, metadata: { scenarioId: id, tipo: 'scenario' } });

  return prisma.trainingScenarioDraft.findUniqueOrThrow({ where: { id } });
}
