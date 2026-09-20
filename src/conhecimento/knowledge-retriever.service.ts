// Knowledge Retriever (Etapa 2C.2).
//
// Responde a UMA pergunta, e só a ela:
//
//   "Dado um domínio já determinado e uma empresa, existe um KnowledgeCard
//    publicado e autorizado que eu possa oferecer?"
//
// Resposta: **um card, ou NO_KNOWLEDGE.** Nunca "alguma coisa parecida só pra
// não voltar vazio".
//
// NENHUM CONHECIMENTO É MELHOR QUE CONHECIMENTO ERRADO.
//
// O QUE ELE NÃO FAZ — e a lista importa tanto quanto o que ele faz:
// não lê a mensagem do vendedor, não descobre intenção, não vê humor, não
// decide pertinência, não classifica ciência, não conversa, não gera texto,
// não reescreve o card e não chama LLM nenhum. Traduzir "não consigo manter
// uma rotina" em "escola de hábitos" é o Router, que é a 2C.4.
//
// E nesta etapa **o Conselheiro ainda não sabe que este arquivo existe**.
import { KnowledgeCard, PublicoConteudo, TipoFonteConhecimento } from '@prisma/client';
import { MAX_CANDIDATOS, listarElegiveis } from './knowledge-card.service';

/**
 * O pedido.
 *
 * `empresaId` é o escopo — resolvido pelo chamador a partir do sujeito
 * autenticado, **nunca de um corpo de requisição**. Repare que não existe um
 * segundo campo "empresa solicitada" ao lado dele: sem dois valores pra
 * divergirem, não há tenant pra forjar.
 *
 * `escolaId` já vem decidido. O Retriever começa **depois** que o domínio foi
 * determinado.
 */
export interface PedidoDeConhecimento {
  empresaId: string;
  escolaId: string;
  /** Para quem é a conversa. `BOTH` sempre entra. */
  audience?: PublicoConteudo;
  /**
   * Filtro EXPLÍCITO de natureza da fonte. Quem pede ciência recebe ciência ou
   * nada — jamais uma reflexão no lugar. O Retriever nunca infere o tipo a
   * partir do texto; ele obedece ao que foi pedido e ao que está cadastrado.
   */
  tipoFonte?: TipoFonteConhecimento[];
  /**
   * Especialização dentro da escola — vem do TÓPICO que o Router decidiu
   * (Etapa 2C.4), nunca do texto do vendedor e nunca de um id de card.
   */
  tags?: string[];
}

/** O card entregue — só o que a camada de contexto (2C.5) vai precisar. */
export interface ConhecimentoRecuperado {
  id: string;
  chave: string;
  escolaId: string;
  titulo: string;
  principio: string;
  /** Preservado INTEGRALMENTE e não interpretado — interpretar é 2C.4/2C.5. */
  quandoUsar: string;
  /** Idem. É o campo que impede o conselho certo na hora errada. */
  quandoNaoUsar: string;
  exemplo: string | null;
  tipoFonte: TipoFonteConhecimento;
  fonte: string | null;
  autor: string | null;
  referencia: string | null;
  licenca: KnowledgeCard['licenca'];
  notaProvenance: string | null;
  version: number;
  escopo: 'GLOBAL' | 'EMPRESA';
}

export type ResultadoDeConhecimento = { tipo: 'FOUND'; card: ConhecimentoRecuperado } | { tipo: 'NO_KNOWLEDGE' };

/**
 * Precedência por tipo de fonte — a hierarquia aprovada na 2C.0 (§10).
 *
 * É metadado, nunca leitura semântica do conteúdo: o Retriever não compara
 * ideias, compara classificações declaradas por quem cadastrou. O oficial da
 * empresa vence a orientação genérica; o reflexivo nunca ocupa o lugar do
 * científico.
 *
 * `Record` exaustivo sobre o enum: um tipo novo não compila até alguém decidir
 * onde ele entra na hierarquia.
 */
const PRECEDENCIA: Record<TipoFonteConhecimento, number> = {
  OFICIAL_EMPRESA: 0,
  CIENTIFICO: 1,
  PROFISSIONAL: 2,
  DESENVOLVIMENTO_PESSOAL: 3,
  METODOLOGIA: 4,
  REFLEXIVO: 5,
  DEMONSTRATIVO: 6,
};

/**
 * Override por IDENTIDADE, nunca por escola inteira.
 *
 * Quando a empresa tem um card com a MESMA chave de um global, o da empresa
 * prevalece — é a versão dela daquele conhecimento. Mas o global sobre outro
 * assunto continua candidato: ter um card próprio sobre rotina de abertura não
 * pode apagar o global sobre formação de hábitos.
 *
 * A regra "se existe qualquer card da empresa, ignore todos os globais" seria
 * mais simples e destruiria a biblioteca compartilhada — é precisamente o que
 * esta função evita.
 */
function aplicarOverride(candidatos: readonly KnowledgeCard[]): KnowledgeCard[] {
  const chavesDaEmpresa = new Set(candidatos.filter((c) => c.empresaId !== null).map((c) => c.chave));
  return candidatos.filter((c) => c.empresaId !== null || !chavesDaEmpresa.has(c.chave));
}

/**
 * Escolhe UM card. Função PURA — sem banco, sem IA, sem relógio.
 *
 * Separada da consulta de propósito: precedência e desempate são a parte
 * delicada, e poder exercitá-los sem infraestrutura é o que torna o
 * comportamento provável caso a caso.
 *
 * Ordem: override por identidade → precedência de tipo de fonte → chave →
 * id. **Toda ordenação termina em desempate determinístico**: a 2B.3 e a 2B.4
 * já mostraram que empate sem critério vira teste que passa por sorte e
 * produção que erra de vez em quando.
 */
export function selecionarUm(candidatos: readonly KnowledgeCard[]): KnowledgeCard | null {
  const elegiveis = aplicarOverride(candidatos);
  if (elegiveis.length === 0) return null;

  return [...elegiveis].sort(
    (a, b) =>
      PRECEDENCIA[a.tipoFonte] - PRECEDENCIA[b.tipoFonte] ||
      a.chave.localeCompare(b.chave) ||
      a.id.localeCompare(b.id)
  )[0];
}

function paraResultado(card: KnowledgeCard): ConhecimentoRecuperado {
  return {
    id: card.id,
    chave: card.chave,
    escolaId: card.escolaId,
    titulo: card.titulo,
    principio: card.principio,
    quandoUsar: card.quandoUsar,
    quandoNaoUsar: card.quandoNaoUsar,
    exemplo: card.exemplo,
    tipoFonte: card.tipoFonte,
    fonte: card.fonte,
    autor: card.autor,
    referencia: card.referencia,
    licenca: card.licenca,
    notaProvenance: card.notaProvenance,
    version: card.version,
    // Campos editoriais internos (status, createdBy, approvedBy, timestamps)
    // ficam de fora: quem conversa não precisa saber quem aprovou.
    escopo: card.empresaId === null ? 'GLOBAL' : 'EMPRESA',
  };
}

/**
 * Recupera conhecimento para um domínio já determinado.
 *
 * TENANT ANTES DE RELEVÂNCIA: `listarElegiveis` filtra empresa, status e escola
 * **no banco**, e só o que sobra é ordenado. Nunca o contrário — buscar tudo,
 * escolher o melhor e depois conferir de quem é seria o caminho mais curto pra
 * vazar conteúdo entre empresas.
 *
 * Uma consulta, com teto. Não lança quando não há card: **`NO_KNOWLEDGE` é
 * caminho normal, não erro** — e é assim que a política aprovada na 2C.0
 * (sem card governado, não se afirma ciência, metodologia nomeada ou política
 * da empresa) vai ter onde se apoiar na 2C.5.
 *
 * Sobre licença: **nenhum estado bloqueia recuperação hoje**, e isso é
 * deliberado. `REVISAR` é o default de todo card, então filtrá-lo tornaria
 * invisível todo conteúdo que passou pelo ciclo humano completo — um no-op
 * silencioso, que é o tipo de bug que este projeto já pagou caro. A revisão de
 * direitos acontece na aprovação humana, que é onde ela cabe; o campo viaja no
 * resultado pra 2C.5 decidir apresentação. Um estado explicitamente bloqueante
 * não existe no enum e não foi inventado aqui.
 */
export async function recuperarConhecimento(pedido: PedidoDeConhecimento): Promise<ResultadoDeConhecimento> {
  const candidatos = await listarElegiveis(pedido.empresaId, {
    escolaId: pedido.escolaId,
    audience: pedido.audience,
    tipoFonte: pedido.tipoFonte,
    tags: pedido.tags,
  });

  const escolhido = selecionarUm(candidatos);
  return escolhido ? { tipo: 'FOUND', card: paraResultado(escolhido) } : { tipo: 'NO_KNOWLEDGE' };
}

export { MAX_CANDIDATOS };
