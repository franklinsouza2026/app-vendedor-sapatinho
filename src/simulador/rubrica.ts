// Rubrica de avaliação do Simulador (seção "avaliação" da Fatia 6) — critérios
// fechados, definidos pelo sistema. Cada cenário declara um subconjunto
// relevante em `SimulationScenario.criteriosAvaliacao`; o LLM nunca escolhe
// os critérios, só preenche score pra cada um que o backend pediu.
export const CRITERIOS_AVALIACAO = [
  'ABORDAGEM',
  'SONDAGEM',
  'ESCUTA',
  'ARGUMENTACAO',
  'USO_DO_PLAYBOOK',
  'TRATAMENTO_DE_OBJECOES',
  'VENDA_COMPLEMENTAR',
  'FECHAMENTO',
  'CLAREZA',
  'EXPERIENCIA_DO_CLIENTE',
  // Fatia 9.6, seção 33 — Simulador Gerencial (situações de gestão de
  // pessoas); reaproveita ESCUTA/ARGUMENTACAO/CLAREZA já existentes, só
  // acrescenta o único critério genuinamente novo desse contexto.
  'EMPATIA',
] as const;

export type CriterioAvaliacao = (typeof CRITERIOS_AVALIACAO)[number];

export function isCriterioValido(valor: unknown): valor is CriterioAvaliacao {
  return typeof valor === 'string' && (CRITERIOS_AVALIACAO as readonly string[]).includes(valor);
}
