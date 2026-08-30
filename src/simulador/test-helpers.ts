// Helpers só pra testes do Simulador — cria um SimulationScenario isolado
// (catálogo GLOBAL, code sempre novo via randomUUID) pra não colidir com o
// catálogo real semeado por scenario-seed.ts nem entre testes.
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { PersonaSimulacao } from './context.types';
import { CriterioAvaliacao } from './rubrica';

export interface CenarioTesteOptions {
  criteriosAvaliacao?: CriterioAvaliacao[];
  maxTurnsPorDificuldade?: Partial<Record<'EASY' | 'MEDIUM' | 'HARD', number>>;
  playbookCategorias?: string[];
  active?: boolean;
  apenasDificuldades?: Array<'EASY' | 'MEDIUM' | 'HARD'>;
  personaOverride?: Partial<PersonaSimulacao>;
}

export async function criarCenarioTeste(opts: CenarioTesteOptions = {}) {
  const persona: PersonaSimulacao = {
    profile: 'Cliente teste, indeciso sobre o tênis ideal',
    initialNeed: 'Estou procurando um tênis casual pra usar no dia a dia.',
    hiddenNeeds: ['conforto pra ficar em pé o dia inteiro no trabalho'],
    objections: ['Está caro.', 'Preciso pensar melhor.'],
    behavior: 'educada mas indecisa',
    successCondition: 'vendedor identifica a necessidade oculta antes do fechamento',
    ...opts.personaOverride,
  };

  const dificuldades = opts.apenasDificuldades ?? (['EASY', 'MEDIUM', 'HARD'] as const);
  const personasPorDificuldade: Record<string, PersonaSimulacao> = {};
  for (const d of dificuldades) personasPorDificuldade[d] = persona;

  const maxTurnsPorDificuldade = { EASY: 8, MEDIUM: 11, HARD: 15, ...opts.maxTurnsPorDificuldade };

  return prisma.simulationScenario.create({
    data: {
      code: `cenario-teste-${randomUUID()}`,
      title: 'Cenário de teste',
      description: 'Cenário criado só para testes automatizados.',
      category: 'GERAL',
      objective: 'Concluir a venda identificando a necessidade real da cliente.',
      active: opts.active ?? true,
      playbookCategorias: opts.playbookCategorias ?? ['ABORDAGEM'],
      criteriosAvaliacao: (opts.criteriosAvaliacao ?? ['ABORDAGEM', 'SONDAGEM', 'FECHAMENTO']) as unknown as Prisma.InputJsonValue,
      personasPorDificuldade: personasPorDificuldade as unknown as Prisma.InputJsonValue,
      maxTurnsPorDificuldade,
    },
  });
}
