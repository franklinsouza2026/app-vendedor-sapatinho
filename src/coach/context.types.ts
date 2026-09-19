// CoachContext — reorganizado na Etapa 2B.1 em TRÊS BLOCOS CONCEITUAIS.
//
// Antes, tudo era um objeto plano e o formatter renderizava o objeto inteiro em
// toda conversa: meta, gap, PA, ticket, baseline e gamificação chegavam ao
// prompt incondicionalmente, enquanto o check-in do vendedor não chegava nunca.
// A 2B.0 provou que a hierarquia estava invertida — a pessoa estava ausente do
// contexto e a performance era o contexto inteiro.
//
// Agora o contexto é montado a partir dos DOMÍNIOS AUTORIZADOS pelo gate de
// pertinência. Um bloco não autorizado não é filtrado na renderização: ele
// simplesmente **não é carregado do banco**, o que torna o vazamento
// estruturalmente impossível em vez de depender de o formatter se lembrar.
//
// Nomes de campo em inglês conforme a fonte de verdade; nunca inclui objeto ORM
// inteiro, hash, token, ID desnecessário ou dado de outro vendedor/tenant.
import { MoodCheckIn, StatusIntervencaoCoach } from '@prisma/client';
import { DecisaoPertinencia } from '../pertinencia/tipos';

export type BaselineStatus = 'disponivel' | 'em_formacao';

/**
 * Continuidade relacional (Etapa 2B.2) — o que já foi conversado e ficou em
 * aberto. Vive no bloco HUMANO porque continuidade importa em TODA conversa,
 * inclusive numa de acolhimento; em `desenvolvimento` ela sumiria justamente
 * onde mais faz falta.
 *
 * Estar aqui NÃO obriga o Conselheiro a retomar o assunto — SABER ≠ FALAR, e
 * o momento atual continua soberano sobre a memória (Etapa 2B.1).
 */
export interface ItemContinuidade {
  /** O que foi sugerido, já resolvido em texto legível. */
  assunto: string;
  /**
   * Tipado pelo enum do Prisma, não `string`: assim o `Record` de tradução no
   * formatter é exaustivo por construção, e um estado novo que ninguém
   * traduziu não compila — em vez de vazar o enum cru pro prompt.
   */
  estado: StatusIntervencaoCoach;
  quando: string; // ISO
}

/** Bloco HUMANO — quem é a pessoa e como ela está. Sempre presente. */
export interface ContextoHumano {
  /**
   * Como o vendedor DECLAROU estar hoje. É relato datado, nunca diagnóstico:
   * o prompt o apresenta como "o vendedor relatou", e a Constituição §20 (G1)
   * proíbe derivar condição clínica ou traço a partir dele.
   *
   * `null` quando não houve check-in hoje — e isso não é inferência nenhuma.
   */
  checkinHoje: MoodCheckIn | null;
  /** Assuntos vivos da relação — bounded, ver MAX_INTERVENCOES_NO_CONTEXTO. */
  continuidade: ItemContinuidade[];
}

/** Bloco DESENVOLVIMENTO — evolução por evidência, nunca por KPI. */
export interface ContextoDesenvolvimento {
  /**
   * Gaps vindos da Universidade (Etapa 2A) — origem EVIDÊNCIA (aula, quiz,
   * simulação, avaliação do gerente), nunca KPI.
   */
  competencyGaps: { competencyId: string; nome: string; score: number; target: number; gap: number; prioridade: string }[];
  /** Atividades de aprendizagem concluídas recentemente — fato, não catálogo. */
  recentTrainings: AtividadeRecente[];
  /** Conquistas reais e verificáveis do PRÓPRIO vendedor (Constituição §10). */
  positiveSignals: SinalPositivoDoVendedor[];
  /** Missão de aprendizagem do dia — só as de desenvolvimento entram aqui. */
  currentMission: string | null;
}

export interface AtividadeRecente {
  tipo: 'AULA' | 'QUIZ' | 'SIMULACAO';
  titulo: string;
  quando: string; // ISO
  /** Nota, quando o tipo produz uma. Nunca inventada. */
  resultado: number | null;
}

export interface SinalPositivoDoVendedor {
  tipo: string;
  descricao: string;
  /** Identidade do fato — usada pra registrar que ele já foi celebrado. */
  sourceId: string;
}

/**
 * Bloco COMERCIAL — **opcional por desenho**.
 *
 * `null` significa que este bloco não foi autorizado nesta conversa. Não é
 * ausência de dado: é decisão de pertinência. O vendedor continua tendo meta e
 * PA; o Conselheiro é que não os recebeu agora.
 */
export interface ContextoComercial {
  goal: {
    todayGoal: number | null;
    realized: number;
    goalPercent: number | null;
    amountRemaining: number | null;
    estimatedSalesRemaining: number | null;
  };
  performance: {
    ticket: number;
    pa: number;
    /**
     * Número de VENDAS fechadas no período.
     *
     * O campo de origem no ERP se chama `numAtendimentos`, mas a 2B.0 provou
     * que ele conta transações, não clientes atendidos (`faturamento =
     * ticketMedio × numAtendimentos`). Renomeado aqui porque era este o nome
     * que chegava ao prompt e à tela — e "atendimentos" fazia o vendedor
     * procurar a causa no lugar errado.
     */
    salesCount: number;
  };
  baseline: {
    ticket: number | null;
    pa: number | null;
    status: BaselineStatus;
  };
  gamification: {
    xp: number;
    level: string;
    streak: number;
    recentBadges: string[];
  };
  /**
   * Resumo e foco derivados de KPI (`ProfessionalMemory`). Ficam aqui, e não em
   * desenvolvimento, porque são texto derivado de indicador comercial
   * ("Em desenvolvimento: ticket médio") — deixá-los fora deste bloco faria
   * performance vazar para uma conversa de acolhimento por via indireta.
   */
  professionalMemorySummary: string | null;
  currentFocus: string | null;
  /** Missão comercial do dia (meta/PA/ticket/streak). */
  currentMission: string | null;
}

export interface CoachContext {
  seller: { displayName: string };
  store: { name: string };
  /** A decisão que produziu este contexto — vai para o prompt como orientação de tom. */
  pertinencia: DecisaoPertinencia;
  humano: ContextoHumano;
  desenvolvimento: ContextoDesenvolvimento | null;
  comercial: ContextoComercial | null;
  freshness: {
    /** ISO — `null` quando o vendedor nunca teve indicador sincronizado. */
    lastDataSyncAt: string | null;
  };
}
