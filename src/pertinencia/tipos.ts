// Pertinência (Etapa 2B.1) — o vocabulário fechado que decide O QUE o
// Conselheiro pode ver numa conversa.
//
// POR QUE ESTE MÓDULO EXISTE, FORA DE `src/coach/`: a auditoria da 2B.0 provou
// que a arquitetura estava invertida — `context-formatter.ts` injetava meta,
// gap, PA, ticket e baseline em TODA conversa, incondicionalmente, enquanto o
// check-in do vendedor não chegava à IA. O Conselheiro sabia quanto faltava
// pra meta e não sabia que a pessoa tinha declarado estar mal.
//
// Treinador e Simulador terão a mesma necessidade, e pertinência é conceito de
// produto, não de um especialista — mesmo raciocínio que extraiu
// `src/ai-platform/` de `src/coach/` na Fatia 5 (Decisão 166).
//
// REGRA ESTRUTURAL: o LLM classifica INTENÇÃO; o código decide DOMÍNIO.
// O classificador nunca recebe KPI, então não pode escolher falar de um KPI
// só porque o recebeu. Ver `classificador.service.ts`.

/**
 * O que o vendedor está buscando nesta mensagem.
 *
 * Enum FECHADO: é a única coisa que o LLM devolve, e é validada contra esta
 * lista antes de qualquer uso. Um valor fora dela cai no fallback seguro.
 */
export const INTENCOES = ['DESABAFO', 'CONVERSA', 'DUVIDA_COMERCIAL', 'DESENVOLVIMENTO', 'CELEBRACAO', 'OUTRO'] as const;
export type Intencao = (typeof INTENCOES)[number];

/**
 * Estado comportamental do Conselheiro (Constituição §7).
 *
 * NÃO é botão, modo ou tela — o vendedor nunca o vê nem o escolhe. É orientação
 * interna que determina o tom pedido ao LLM e, junto com a intenção, o que
 * entra no contexto.
 */
export const ESTADOS = ['ACOLHER', 'REFLETIR', 'DESENVOLVER', 'TREINAR', 'AGIR', 'CELEBRAR'] as const;
export type EstadoComportamental = (typeof ESTADOS)[number];

/**
 * Blocos conceituais de contexto. Só os domínios autorizados são CARREGADOS —
 * não é filtro de apresentação, é filtro de busca: o que não é autorizado nunca
 * sai do banco, então não há como vazar por um caminho secundário.
 */
export const DOMINIOS = ['HUMANO', 'DESENVOLVIMENTO', 'COMERCIAL'] as const;
export type DominioContexto = (typeof DOMINIOS)[number];

/** Decisão de pertinência — produzida SEMPRE por código determinístico. */
export interface DecisaoPertinencia {
  intencao: Intencao;
  estado: EstadoComportamental;
  /** Domínios autorizados. Derivado de (intenção + check-in), nunca vindo do LLM. */
  dominios: DominioContexto[];
  /** Como a intenção foi obtida — para telemetria, teste e relatório de custo. */
  origem: 'DETERMINISTICO' | 'LLM' | 'FALLBACK';
}
