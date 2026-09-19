// Memória de Intervenções (Etapa 2B.2) — continuidade relacional.
//
// Existe pra o Conselheiro conseguir pensar "já conversei com essa pessoa sobre
// isso", "ela não quis naquele momento", "ela concluiu aquilo" — e NUNCA pra o
// sistema pensar "este funcionário obedece minhas recomendações". É memória de
// continuidade, não de vigilância.
//
// TERCEIRA camada, separada das outras duas de propósito:
//   CoachMessage       = transcrição
//   ProfessionalMemory = memória profissional derivada de KPI
//   CoachIntervention  = o que já foi dito e o que aconteceu depois
import { Prisma, StatusIntervencaoCoach, TipoIntervencaoCoach } from '@prisma/client';
import { prisma } from '../db';
import { createLogger } from '../utils/logger';

const log = createLogger('coach:intervencao');

/**
 * Fontes possíveis de uma intervenção — identidade de DOMÍNIO, nunca texto.
 *
 * Fechado de propósito: um `sourceType` livre permitiria que um valor forjado
 * ou um typo criasse uma identidade nova e furasse o dedupe em silêncio.
 */
export const SOURCE_TYPES = ['FEED_EVENT', 'COMPETENCY', 'ACADEMY_LESSON', 'SIMULATION_SCENARIO'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

/** Estados em que o assunto ainda está vivo — espelha o índice único parcial do banco. */
const STATUS_ATIVOS: StatusIntervencaoCoach[] = ['REGISTRADA', 'ACEITA', 'ADIADA'];

/**
 * Transições permitidas. `Record` exaustivo sobre o enum: um estado novo não
 * compila até alguém decidir de onde ele pode vir.
 *
 * Nenhum estado terminal reabre sozinho — `RECUSADA` e `CONCLUIDA` não voltam.
 * Recusa é contextual àquela sugestão: o assunto pode voltar mais tarde como
 * uma intervenção NOVA, nunca revivendo a antiga.
 */
const TRANSICOES: Record<StatusIntervencaoCoach, StatusIntervencaoCoach[]> = {
  REGISTRADA: ['ACEITA', 'RECUSADA', 'ADIADA', 'CONCLUIDA'],
  // "Vou fazer" pode virar conclusão (por fato de sistema) ou mudar de ideia.
  ACEITA: ['CONCLUIDA', 'RECUSADA', 'ADIADA'],
  // "Depois eu faço" pode virar conclusão real, aceite explícito ou recusa.
  ADIADA: ['CONCLUIDA', 'ACEITA', 'RECUSADA'],
  RECUSADA: [],
  CONCLUIDA: [],
};

export function transicaoPermitida(de: StatusIntervencaoCoach, para: StatusIntervencaoCoach): boolean {
  return TRANSICOES[de].includes(para);
}

/**
 * Identidade do acontecimento.
 *
 * Inclui o `vendedorId` porque a fonte costuma ser catálogo GLOBAL (competência,
 * aula, cenário) — sem ele, duas pessoas conversando sobre a mesma competência
 * colidiriam no índice único. Mesma forma do `ManagerAlert.dedupeKey`.
 *
 * `sourceId` é exigido: sem identidade de domínio não há dedupe determinístico,
 * e a alternativa seria chavear por texto gerado por LLM — instável por
 * natureza. A coluna é nullable no banco só pra não travar usos futuros.
 */
export function montarDedupeKey(vendedorId: string, tipo: TipoIntervencaoCoach, sourceType: SourceType, sourceId: string): string {
  return `${vendedorId}:${tipo}:${sourceType}:${sourceId}`;
}

export interface RegistrarIntervencaoInput {
  empresaId: string;
  vendedorId: string;
  conversationId?: string | null;
  tipo: TipoIntervencaoCoach;
  sourceType: SourceType;
  sourceId: string;
  /** Contexto estruturado mínimo — jamais conversa, humor, desabafo ou KPI. */
  metadata?: Record<string, string | number | boolean>;
}

/**
 * Registra uma intervenção, de forma idempotente.
 *
 * Se já existe uma ATIVA com a mesma identidade, devolve a existente sem criar
 * outra — o índice único parcial fecha a janela entre o `findFirst` e o
 * `create` (duas requisições concorrentes não criam duas sugestões iguais).
 * Mesmo padrão de `ManagerAlert` e `FeedEvent`.
 */
export async function registrarIntervencao(input: RegistrarIntervencaoInput) {
  const dedupeKey = montarDedupeKey(input.vendedorId, input.tipo, input.sourceType, input.sourceId);

  const ativa = await prisma.coachIntervention.findFirst({ where: { dedupeKey, status: { in: STATUS_ATIVOS } } });
  if (ativa) return ativa;

  try {
    return await prisma.coachIntervention.create({
      data: {
        empresaId: input.empresaId,
        vendedorId: input.vendedorId,
        conversationId: input.conversationId ?? null,
        tipo: input.tipo,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        dedupeKey,
        metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (err) {
    // Outra requisição concorrente criou a mesma intervenção entre o findFirst
    // e o create — idempotente, devolve a que venceu.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return prisma.coachIntervention.findFirstOrThrow({ where: { dedupeKey, status: { in: STATUS_ATIVOS } } });
    }
    throw err;
  }
}

/**
 * Aplica uma transição de estado, atomicamente.
 *
 * `updateMany` condicional (nunca ler-então-escrever): duas respostas
 * concorrentes não produzem duas transições. Devolve `false` quando a
 * transição não era permitida ou o estado já havia mudado.
 */
export async function transicionarIntervencao(id: string, vendedorId: string, novo: StatusIntervencaoCoach): Promise<boolean> {
  const origens = (Object.keys(TRANSICOES) as StatusIntervencaoCoach[]).filter((de) => transicaoPermitida(de, novo));
  if (origens.length === 0) return false;

  // `vendedorId` no where é defesa em profundidade: mesmo que um id de
  // intervenção vaze, ninguém transiciona a intervenção de outra pessoa.
  const r = await prisma.coachIntervention.updateMany({
    where: { id, vendedorId, status: { in: origens } },
    data: { status: novo },
  });
  return r.count === 1;
}

/**
 * Este assunto já foi tratado recentemente?
 *
 * É o coração da anti-repetição — e é uma pergunta de LEITURA, não uma
 * constraint: um assunto recusado ou concluído sai do índice único, mas
 * continua "falado recentemente" por esta janela. Sem isso, o Conselheiro
 * celebraria a mesma certificação em toda conversa (comportamento medido antes
 * desta etapa).
 */
export async function jaTratadoRecentemente(
  vendedorId: string,
  tipo: TipoIntervencaoCoach,
  sourceType: SourceType,
  sourceId: string,
  desde: Date
): Promise<boolean> {
  const n = await prisma.coachIntervention.count({
    where: { dedupeKey: montarDedupeKey(vendedorId, tipo, sourceType, sourceId), ocorridoEm: { gte: desde } },
  });
  return n > 0;
}

/**
 * Continuidade relevante pra levar à conversa — BOUNDED.
 *
 * O teto acompanha o padrão já usado no contexto do Conselheiro
 * (`MAX_GAPS_NO_CONTEXTO = 3`): contexto suficiente, nunca memória infinita.
 * Estar aqui não obriga o Conselheiro a mencionar — SABER ≠ FALAR continua
 * valendo, e o motor de pertinência decide.
 */
export const MAX_INTERVENCOES_NO_CONTEXTO = 3;

/**
 * Por quanto tempo uma pendência continua sendo "assunto vivo".
 *
 * Uma sugestão que a pessoa simplesmente ignorou não pode ficar no prompt para
 * sempre — vira cobrança silenciosa e, pior, faz o classificador de resposta
 * ser chamado em toda mensagem ambígua daí em diante, gastando IA à toa.
 * Passado esse prazo, o assunto some da continuidade (a linha fica no banco:
 * nada é apagado, só deixa de ser trazido).
 */
const DIAS_PENDENCIA_VIVA = 30;

export async function listarContinuidadeRelevante(vendedorId: string, agora: Date = new Date()) {
  return prisma.coachIntervention.findMany({
    // Só assunto vivo: o que foi recusado ou concluído não é pendência, e o que
    // é velho demais deixou de ser assunto.
    where: {
      vendedorId,
      status: { in: STATUS_ATIVOS },
      tipo: 'SUGERIU',
      ocorridoEm: { gte: new Date(agora.getTime() - DIAS_PENDENCIA_VIVA * 24 * 60 * 60 * 1000) },
    },
    orderBy: { ocorridoEm: 'desc' },
    take: MAX_INTERVENCOES_NO_CONTEXTO,
  });
}

export { log };
