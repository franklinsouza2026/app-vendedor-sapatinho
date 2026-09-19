// Seleção da intervenção do turno (Etapa 2B.3).
//
// PROBLEMA QUE ISTO FECHA, medido contra o servidor real antes de qualquer
// código. Com uma certificação e um PDI concluído disponíveis, três conversas
// seguidas produziram:
//
//   conversa 1 → celebrou o PDI    (mas a certificação também foi REGISTRADA)
//   conversa 2 → sugeriu objeções
//   conversa 3 → sugeriu objeções  (a MESMA, de novo)
//
// Dois bugs distintos:
//   1. Todos os candidatos do contexto eram registrados como se tivessem sido
//      apresentados. A certificação nunca foi dita e mesmo assim queimou —
//      sumiu por 7 dias sem que o vendedor visse nada.
//   2. Uma sugestão já ativa continuava sendo re-apresentada, porque nada
//      impedia o mesmo assunto de voltar enquanto estava pendente.
//
// A CORREÇÃO É ARQUITETURAL: **no máximo UMA intervenção estruturada por
// turno, escolhida ANTES de gerar**. Só a escolhida entra no contexto, e só
// ela é registrada — depois de a resposta existir.
//
// Assim "candidato", "selecionado" e "apresentado" deixam de divergir: o que
// não foi escolhido nunca entrou no prompt, então continua elegível amanhã.
//
// Por que UMA: o Conselheiro conversa, não entrega checklist. Isso limita
// apenas a intervenção RASTREÁVEL — a conversa continua livre para tocar em
// quantos assuntos fizerem sentido.
import { TipoIntervencaoCoach } from '@prisma/client';
import { prisma } from '../db';
import { EstadoComportamental } from '../pertinencia/tipos';
import { SinalPositivoDoVendedor } from './context.types';
import { SourceType, inicioDaPendenciaViva, inicioDoCooldown, montarDedupeKey } from './intervencao.service';

/**
 * A intervenção que o turno vai apresentar — ou `null` quando não há nenhuma
 * pertinente. Nenhum turno é obrigado a ter uma.
 */
export interface IntervencaoDoTurno {
  tipo: TipoIntervencaoCoach;
  sourceType: SourceType;
  sourceId: string;
  /** Texto já resolvido — é o que o Conselheiro vê e o que fica no metadata. */
  titulo: string;
}

/**
 * O mínimo que a seleção precisa saber de um gap. Genérico no resto: quem chama
 * passa o gap completo do contexto e recebe de volta o MESMO objeto filtrado,
 * sem a seleção precisar conhecer (ou descartar) score, target e afins.
 */
export interface GapCandidato {
  competencyId: string;
  nome: string;
}

export interface CandidatosDoTurno<G extends GapCandidato> {
  positiveSignals: SinalPositivoDoVendedor[];
  /** Já ordenados por prioridade pelo motor de competência — o topo é o alvo. */
  competencyGaps: G[];
}

export interface ResultadoSelecao<G extends GapCandidato> {
  intervencao: IntervencaoDoTurno | null;
  /**
   * Gaps que ainda podem aparecer no prompt como contexto geral.
   *
   * Exclui os que têm intervenção viva ou em silêncio: mostrá-los convidaria o
   * modelo a sugerir de novo justamente o que o sistema decidiu NÃO levantar —
   * e essa sugestão sairia sem registro nenhum, repetindo o bug por um canal
   * não rastreado. A seleção fecha o canal estruturado; isto fecha o outro.
   */
  gapsParaContexto: G[];
}

/**
 * Escolhe, deterministicamente, a única intervenção do turno.
 *
 * Ordem padrão — reconhecer antes de pedir (Constituição §10):
 *   1. CELEBRAR uma conquista ainda não celebrada;
 *   2. SUGERIR trabalho na competência de maior gap.
 *
 * Critérios são todos factuais e já aprovados: novidade (cooldown), status
 * (não repetir o que está pendente), prioridade do gap (que o motor de
 * competência já calcula) e o modo comportamental. Nenhum score psicológico,
 * nenhum limiar comercial novo.
 */
export async function selecionarIntervencaoDoTurno<G extends GapCandidato>(
  vendedorId: string,
  estado: EstadoComportamental,
  candidatos: CandidatosDoTurno<G>,
  agora: Date = new Date(),
  /**
   * Esta mensagem foi a resposta do vendedor a uma sugestão?
   *
   * Se foi, nenhuma sugestão NOVA abre neste turno. Sem isso o turno em que ele
   * diz "não quero fazer isso" respondia, na mesma frase, "então faz este
   * outro": a recusa era registrada e imediatamente substituída — cobrança em
   * cima de recusa, exatamente o que a Constituição proíbe. Celebrar continua
   * permitido; reconhecer não é cobrar.
   */
  respondeuSugestao = false
): Promise<ResultadoSelecao<G>> {
  // ACOLHER nunca carrega intervenção: a pessoa e o momento continuam acima de
  // qualquer follow-up (Etapa 2B.1, soberana). Na prática o bloco de
  // desenvolvimento nem é carregado aqui — a guarda é defesa em profundidade.
  if (estado === 'ACOLHER') return { intervencao: null, gapsParaContexto: [] };

  const estados = await carregarEstadoDosCandidatos(vendedorId, candidatos, agora);

  // Um assunto por vez: havendo QUALQUER sugestão aguardando resposta, não se
  // abre outra. Sem isso, cada turno podia levantar uma competência diferente
  // — o "checklist" que esta arquitetura existe pra evitar — e a resposta do
  // vendedor ("já fiz") acabaria colada na sugestão errada.
  const temSugestaoPendente = respondeuSugestao || (await existeSugestaoPendente(vendedorId, agora));

  const celebracao = candidatos.positiveSignals.find((s) => !estados.tratados.has(chaveCelebracao(vendedorId, s.sourceId)));
  const gapLivre = candidatos.competencyGaps.find((g) => !estados.tratados.has(chaveSugestao(vendedorId, g.competencyId)));

  const celebrar = (): IntervencaoDoTurno | null =>
    celebracao ? { tipo: 'CELEBROU', sourceType: 'FEED_EVENT', sourceId: celebracao.sourceId, titulo: celebracao.descricao } : null;

  const sugerir = (): IntervencaoDoTurno | null =>
    !temSugestaoPendente && gapLivre
      ? { tipo: 'SUGERIU', sourceType: 'COMPETENCY', sourceId: gapLivre.competencyId, titulo: `trabalhar ${gapLivre.nome}` }
      : null;

  // A intenção EXPLÍCITA do vendedor tem precedência sobre a ordem padrão.
  // Quem pergunta "o que preciso melhorar?" quer um caminho, não um elogio.
  const pediuCaminho = estado === 'DESENVOLVER' || estado === 'TREINAR';
  const intervencao = pediuCaminho ? (sugerir() ?? celebrar()) : (celebrar() ?? sugerir());

  return {
    intervencao,
    gapsParaContexto: candidatos.competencyGaps.filter((g) => !estados.tratados.has(chaveSugestao(vendedorId, g.competencyId))),
  };
}

const chaveCelebracao = (vendedorId: string, sourceId: string) => montarDedupeKey(vendedorId, 'CELEBROU', 'FEED_EVENT', sourceId);
const chaveSugestao = (vendedorId: string, competencyId: string) => montarDedupeKey(vendedorId, 'SUGERIU', 'COMPETENCY', competencyId);

/**
 * Estado de TODOS os candidatos numa consulta só.
 *
 * Antes eram até 7 idas ao banco por mensagem (uma por candidato, vezes duas
 * checagens) — em caminho quente, sequenciais. Como ativo e recente são
 * perguntas sobre a MESMA `dedupeKey`, um `findMany` resolve as duas.
 */
async function carregarEstadoDosCandidatos(vendedorId: string, candidatos: CandidatosDoTurno<GapCandidato>, agora: Date) {
  const chaves = [
    ...candidatos.positiveSignals.map((s) => chaveCelebracao(vendedorId, s.sourceId)),
    ...candidatos.competencyGaps.map((g) => chaveSugestao(vendedorId, g.competencyId)),
  ];
  if (chaves.length === 0) return { tratados: new Set<string>() };

  const linhas = await prisma.coachIntervention.findMany({
    where: {
      vendedorId,
      dedupeKey: { in: chaves },
      OR: [
        // Falado recentemente — fica em silêncio pela janela de cooldown.
        { ocorridoEm: { gte: inicioDoCooldown(agora) } },
        // Ou ainda aguardando resposta, dentro da janela em que a pendência é
        // considerada viva. Sem o limite temporal, uma sugestão ignorada
        // travaria aquela competência PARA SEMPRE.
        { status: { in: ['REGISTRADA', 'ACEITA', 'ADIADA'] }, ocorridoEm: { gte: inicioDaPendenciaViva(agora) } },
      ],
    },
    select: { dedupeKey: true },
  });

  return { tratados: new Set(linhas.map((l) => l.dedupeKey)) };
}

/** Existe alguma sugestão viva aguardando resposta, dentro da janela? */
async function existeSugestaoPendente(vendedorId: string, agora: Date): Promise<boolean> {
  const n = await prisma.coachIntervention.count({
    where: {
      vendedorId,
      tipo: 'SUGERIU',
      status: { in: ['REGISTRADA', 'ACEITA', 'ADIADA'] },
      ocorridoEm: { gte: inicioDaPendenciaViva(agora) },
    },
  });
  return n > 0;
}
