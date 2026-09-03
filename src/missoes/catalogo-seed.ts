// Catálogo determinístico de MissionDefinition/ChallengeDefinition (Fatia 7,
// seção 9/25) — GLOBAL (mesmo raciocínio de SimulationScenario/AcademyTrack),
// não por empresa. Conjunto pequeno e verificável com a infraestrutura real
// já existente (nunca um critério que a infra atual não consiga comprovar).
import { prisma } from '../db';
import { MissaoSeed, DesafioSeed } from './tipos';

export const MISSOES: MissaoSeed[] = [
  {
    code: 'DAILY_GOAL',
    title: 'Alcance sua meta diária',
    description: 'Bata 100% da sua meta de faturamento de hoje.',
    category: 'PERFORMANCE',
    criterionType: 'DAILY_GOAL',
    periodType: 'DIA',
    acao: { actionType: 'PERFORMANCE', actionReference: null },
  },
  {
    code: 'PA_IMPROVEMENT',
    title: 'Supere seu PA de referência',
    description: 'Fique pelo menos 5% acima da sua média pessoal de peças por atendimento hoje.',
    category: 'PERFORMANCE',
    criterionType: 'PA_IMPROVEMENT',
    periodType: 'DIA',
    acao: { actionType: 'TRAINER', actionReference: { mode: 'PA' } },
  },
  {
    code: 'TICKET_IMPROVEMENT',
    title: 'Supere seu ticket de referência',
    description: 'Fique pelo menos 5% acima da sua média pessoal de ticket médio hoje.',
    category: 'PERFORMANCE',
    criterionType: 'TICKET_IMPROVEMENT',
    periodType: 'DIA',
    acao: { actionType: 'TRAINER', actionReference: { mode: 'TICKET' } },
  },
  {
    code: 'COMPLETE_LESSON',
    title: 'Conclua uma aula da Academia',
    description: 'Termine qualquer aula da Academia de Vendas hoje.',
    category: 'LEARNING',
    criterionType: 'COMPLETE_LESSON',
    periodType: 'DIA',
    acao: { actionType: 'ACADEMY', actionReference: null },
  },
  {
    code: 'PASS_QUIZ',
    title: 'Passe em um quiz da Academia',
    description: 'Seja aprovado em qualquer quiz da Academia de Vendas hoje.',
    category: 'LEARNING',
    criterionType: 'PASS_QUIZ',
    periodType: 'DIA',
    acao: { actionType: 'ACADEMY', actionReference: null },
  },
  {
    code: 'COMPLETE_SIMULATION',
    title: 'Conclua uma simulação de atendimento',
    description: 'Pratique e finalize uma simulação com a cliente virtual hoje.',
    category: 'SIMULATION',
    criterionType: 'COMPLETE_SIMULATION',
    periodType: 'DIA',
    acao: { actionType: 'SIMULATOR', actionReference: null },
  },
  {
    code: 'STREAK_3',
    title: 'Bata sua meta 3 dias seguidos',
    description: 'Mantenha 3 dias fechados consecutivos batendo a meta diária.',
    category: 'CONSISTENCY',
    criterionType: 'STREAK_3',
    criterionConfig: { alvo: 3 },
    periodType: 'DIA',
    acao: { actionType: 'PERFORMANCE', actionReference: null },
  },
];

// Missões do GERENTE (Fatia 9.6, seção 43) — nunca as missões dos vendedores
// da loja, sempre uma ação do PRÓPRIO gerente, com evidência real (nunca
// client-side complete=true — ver criterio.service.ts).
export const MISSOES_GERENCIAIS: MissaoSeed[] = [
  {
    code: 'MANAGER_RECOGNITION_CREATED',
    title: 'Reconheça um destaque da equipe',
    description: 'Registre um reconhecimento pra algum vendedor com um destaque real hoje.',
    category: 'MANAGEMENT',
    criterionType: 'RECOGNITION_CREATED',
    periodType: 'DIA',
    acao: { actionType: 'MANAGER_ACTION', actionReference: { rota: '/equipe' } },
    targetPapel: 'GERENTE',
  },
  {
    code: 'MANAGER_ONE_ON_ONE_COMPLETED',
    title: 'Realize um 1:1',
    description: 'Conclua uma conversa 1:1 com algum vendedor da equipe.',
    category: 'MANAGEMENT',
    criterionType: 'ONE_ON_ONE_COMPLETED',
    periodType: 'SEMANA',
    acao: { actionType: 'MANAGER_ACTION', actionReference: { rota: '/equipe' } },
    targetPapel: 'GERENTE',
  },
  {
    code: 'MANAGER_PDI_REVIEWED',
    title: 'Revise o desenvolvimento de um vendedor',
    description: 'Registre uma avaliação de competência pra algum vendedor da equipe.',
    category: 'MANAGEMENT',
    criterionType: 'PDI_REVIEWED',
    periodType: 'SEMANA',
    acao: { actionType: 'MANAGER_ACTION', actionReference: { rota: '/equipe' } },
    targetPapel: 'GERENTE',
  },
];

export const DESAFIOS: DesafioSeed[] = [
  {
    code: '3_SIMULATIONS_WEEK',
    title: 'Pratique 3 simulações nesta semana',
    description: 'Conclua 3 simulações de atendimento válidas até o fim da semana.',
    criterionType: '3_SIMULATIONS_WEEK',
    criterionConfig: { alvo: 3 },
    periodType: 'SEMANA',
  },
  {
    code: '3_LESSONS_WEEK',
    title: 'Complete 3 aulas nesta semana',
    description: 'Conclua 3 aulas da Academia de Vendas até o fim da semana.',
    criterionType: '3_LESSONS_WEEK',
    criterionConfig: { alvo: 3 },
    periodType: 'SEMANA',
  },
  {
    code: '5_DAYS_CONSISTENCY',
    title: 'Consistência: 5 dias batendo a meta',
    description: 'Feche 5 dias batendo a meta diária nesta semana.',
    criterionType: '5_DAYS_CONSISTENCY',
    criterionConfig: { alvo: 5 },
    periodType: 'SEMANA',
  },
];

export async function seedMissoesEDesafios() {
  for (const m of [...MISSOES, ...MISSOES_GERENCIAIS]) {
    await prisma.missionDefinition.upsert({
      where: { code: m.code },
      update: {},
      create: {
        code: m.code,
        title: m.title,
        description: m.description,
        category: m.category,
        criterionType: m.criterionType,
        criterionConfig: (m.criterionConfig ?? {}) as object,
        periodType: m.periodType,
        actionType: m.acao.actionType,
        actionReference: m.acao.actionReference as object | undefined,
        targetPapel: m.targetPapel ?? 'VENDEDOR',
      },
    });
  }

  for (const d of DESAFIOS) {
    await prisma.challengeDefinition.upsert({
      where: { code: d.code },
      update: {},
      create: {
        code: d.code,
        title: d.title,
        description: d.description,
        criterionType: d.criterionType,
        criterionConfig: (d.criterionConfig ?? {}) as object,
        periodType: d.periodType,
      },
    });
  }

  return { missoes: MISSOES.length + MISSOES_GERENCIAIS.length, desafios: DESAFIOS.length };
}
