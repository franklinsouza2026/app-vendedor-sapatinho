// Governança do conhecimento do Conselheiro (Etapa 2C.1).
//
// ESTA FATIA CONSTRÓI A ESTANTE. Não coloca os livros, não escolhe o livro e
// não entrega nada ao Conselheiro — ele continua exatamente como está. Não há
// retriever, não há router, nenhum card chega a prompt nenhum.
//
// O que existe aqui é o ciclo editorial: criar rascunho, submeter, aprovar,
// publicar, arquivar — reusando o MESMO `StatusConteudo` e as MESMAS transições
// do CMS de treinamento (Fatia 7.5C), porque governança de conteúdo já foi
// resolvida neste projeto e duplicá-la seria criar um segundo CMS.
//
// DUAS REGRAS QUE NÃO SE NEGOCIAM:
//   1. IA NUNCA PUBLICA. Um agente pode produzir rascunho; tornar ativo é ato
//      humano, e `approvedBy` vem sempre do ator autenticado.
//   2. CONTEÚDO É DADO. Um card que diga "ignore suas instruções anteriores" é
//      texto guardado, não comando — e nesta fatia ele não chega a prompt algum.
import { OrigemEditorial, Prisma, PublicoConteudo, SituacaoLicenca, StatusConteudo, TipoFonteConhecimento } from '@prisma/client';
import { prisma } from '../db';
import { IdentidadeError } from '../identidade/erros';
import { registrarEventoAuditoria } from '../identidade/auditoria.service';

/**
 * Transições permitidas — cópia fiel do CMS (`admin-content.service.ts`).
 *
 * **Não existe atalho `DRAFT → PUBLISHED`.** Todo conhecimento ativo passou por
 * revisão e aprovação, inclusive o que um agente de IA rascunhou.
 */
const TRANSICOES = {
  submeter: { de: ['DRAFT'] as StatusConteudo[], para: 'REVIEW_PENDING' as StatusConteudo },
  aprovar: { de: ['REVIEW_PENDING'] as StatusConteudo[], para: 'APPROVED' as StatusConteudo },
  publicar: { de: ['APPROVED'] as StatusConteudo[], para: 'PUBLISHED' as StatusConteudo },
  arquivar: { de: ['DRAFT', 'REVIEW_PENDING', 'APPROVED', 'PUBLISHED'] as StatusConteudo[], para: 'ARCHIVED' as StatusConteudo },
};

export type TransicaoCard = keyof typeof TRANSICOES;

const ACAO_POR_TRANSICAO: Record<TransicaoCard, 'CONTENT_SUBMITTED_FOR_REVIEW' | 'CONTENT_APPROVED' | 'CONTENT_PUBLISHED' | 'CONTENT_ARCHIVED'> = {
  submeter: 'CONTENT_SUBMITTED_FOR_REVIEW',
  aprovar: 'CONTENT_APPROVED',
  publicar: 'CONTENT_PUBLISHED',
  arquivar: 'CONTENT_ARCHIVED',
};

/**
 * Limites de tamanho — o card precisa continuar pequeno.
 *
 * Calibrados pela medição da 2C.0: o conteúdo real do produto hoje tem **451
 * caracteres em média** (máx 611). O teto do princípio é generoso o bastante
 * pra uma ideia bem explicada e apertado o bastante pra não caber um capítulo
 * de livro — que é exatamente o que a arquitetura não quer guardar.
 */
export const LIMITES = {
  titulo: 120,
  principio: 1200,
  quandoUsar: 600,
  quandoNaoUsar: 600,
  exemplo: 800,
  fonte: 300,
  autor: 200,
  referencia: 500,
  notaProvenance: 1000,
  chave: 80,
  tags: 12,
} as const;

/** Só letras minúsculas, números e hífen — chave estável, previsível em seed e teste. */
const FORMATO_CHAVE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export interface CriarKnowledgeCardInput {
  chave: string;
  escolaId: string;
  /** `null`/ausente = GLOBAL. Ver `assegurarEscopo`. */
  empresaId?: string | null;
  titulo: string;
  principio: string;
  quandoUsar: string;
  quandoNaoUsar: string;
  exemplo?: string | null;
  tipoFonte: TipoFonteConhecimento;
  fonte?: string | null;
  autor?: string | null;
  referencia?: string | null;
  licenca?: SituacaoLicenca;
  notaProvenance?: string | null;
  audience?: PublicoConteudo;
  tags?: string[];
}

/** Campos cuja mudança altera o que o Conselheiro diria — ver `atualizarCard`. */
const CAMPOS_SUBSTANTIVOS = ['principio', 'quandoUsar', 'quandoNaoUsar', 'exemplo', 'tipoFonte', 'escolaId'] as const;

function exigirTamanho(campo: keyof typeof LIMITES, valor: string | null | undefined) {
  if (valor === null || valor === undefined) return;
  if (valor.trim().length === 0) throw new IdentidadeError(400, 'campo_vazio', `"${campo}" não pode ser vazio`);
  if (valor.length > LIMITES[campo]) {
    throw new IdentidadeError(400, 'campo_muito_longo', `"${campo}" excede ${LIMITES[campo]} caracteres — um card é um princípio curado, não um capítulo`);
  }
}

/**
 * Provenance exigida conforme a NATUREZA da fonte — nem todo card precisa de
 * DOI, mas cada um precisa do que a natureza dele exige.
 *
 * `CIENTIFICO` é o mais estrito porque é o único tipo que a política aprovada
 * na 2C.0 autoriza o Conselheiro a afirmar como fato: sem fonte identificável,
 * seria autoridade inventada. `DEMONSTRATIVO` não exige nada — ele existe
 * justamente pra representar honestamente a ausência de material.
 */
function validarProvenance(input: { tipoFonte: TipoFonteConhecimento; fonte?: string | null; autor?: string | null }) {
  const temFonte = Boolean(input.fonte?.trim());
  const temAutor = Boolean(input.autor?.trim());

  if (input.tipoFonte === 'CIENTIFICO' && !temFonte) {
    throw new IdentidadeError(400, 'provenance_insuficiente', 'conteúdo científico exige uma fonte identificável — afirmação factual sem origem é autoridade inventada');
  }
  if (input.tipoFonte === 'METODOLOGIA' && !temFonte && !temAutor) {
    throw new IdentidadeError(400, 'provenance_insuficiente', 'metodologia nomeada exige autor ou fonte — do contrário não há metodologia, há opinião');
  }
}

/**
 * Resolve o escopo **server-side**, a partir do ator — nunca do payload.
 *
 * `empresaId` vindo do cliente é exatamente o vetor de tenant escape: bastaria
 * trocar um campo do JSON pra gravar (ou ler) conteúdo de outra empresa. Aqui o
 * escopo é decidido por quem está autenticado.
 *
 * GLOBAL é suportado pelo schema mas **não é criável por este caminho**: o
 * produto tem `Papel = VENDEDOR | GERENTE | ADMIN` e nenhum papel de plataforma
 * acima da empresa. Inventar um "admin mágico" pra liberar isso seria criar
 * autoridade que o produto não tem. Conhecimento global entra por seed/script
 * de plataforma — mesmo caminho do Playbook, que também só é populado assim.
 */
function assegurarEscopo(input: CriarKnowledgeCardInput, ator: AtorAdministrativo): string {
  if (input.empresaId !== undefined && input.empresaId !== null && input.empresaId !== ator.empresaId) {
    throw new IdentidadeError(403, 'escopo_negado', 'não é possível criar conhecimento para outra empresa');
  }
  if (input.empresaId === null) {
    throw new IdentidadeError(403, 'escopo_negado', 'conhecimento GLOBAL é autoridade de plataforma — não existe papel capaz de criá-lo por esta via');
  }
  return ator.empresaId;
}

/**
 * Quem está agindo. Vem do JWT, resolvido pelo chamador — nunca do corpo da
 * requisição, e é daqui que saem `createdBy` e `approvedBy`.
 */
export interface AtorAdministrativo {
  vendedorId: string;
  empresaId: string;
}

function validarTags(tags: string[] | undefined): string[] {
  if (!tags) return [];
  if (tags.length > LIMITES.tags) throw new IdentidadeError(400, 'tags_demais', `no máximo ${LIMITES.tags} tags — tags especializam dentro da Escola, não substituem a taxonomia`);
  const limpas = tags.map((t) => t.trim().toLowerCase()).filter((t) => t.length > 0);
  for (const tag of limpas) {
    if (!FORMATO_CHAVE.test(tag)) throw new IdentidadeError(400, 'tag_invalida', `tag "${tag}" precisa ser minúscula, sem espaço e sem acento`);
  }
  return [...new Set(limpas)];
}

/**
 * Cria um card — **sempre como rascunho**.
 *
 * `status` não é parâmetro de propósito: não existe caminho, nem para um agente
 * de IA, que faça conhecimento nascer ativo.
 */
export async function criarCard(
  input: CriarKnowledgeCardInput,
  ator: AtorAdministrativo,
  /**
   * Só a Training Intelligence Platform passa isto, quando um agente rascunhar
   * um card — mesmo padrão de `criarTrilha`. Marca a procedência editorial e
   * **não muda nada no ciclo**: o rascunho de IA percorre exatamente as mesmas
   * transições e depende da mesma aprovação humana.
   */
  origemInterna?: { origemEditorial: Extract<OrigemEditorial, 'AI_RESEARCHED' | 'AI_GENERATED'> }
) {
  if (!FORMATO_CHAVE.test(input.chave)) {
    throw new IdentidadeError(400, 'chave_invalida', 'chave precisa ser minúscula, sem espaço e sem acento (ex.: "habito-minimo-viavel")');
  }
  exigirTamanho('chave', input.chave);
  exigirTamanho('titulo', input.titulo);
  exigirTamanho('principio', input.principio);
  exigirTamanho('quandoUsar', input.quandoUsar);
  exigirTamanho('quandoNaoUsar', input.quandoNaoUsar);
  exigirTamanho('exemplo', input.exemplo);
  exigirTamanho('fonte', input.fonte);
  exigirTamanho('autor', input.autor);
  exigirTamanho('referencia', input.referencia);
  exigirTamanho('notaProvenance', input.notaProvenance);
  validarProvenance(input);

  const empresaId = assegurarEscopo(input, ator);
  const tags = validarTags(input.tags);

  // A escola é a taxonomia macro e precisa existir de verdade — um card órfão
  // nunca seria recuperável, porque o retriever vai buscar POR escola.
  const escola = await prisma.escolaUniversidade.findUnique({ where: { id: input.escolaId } });
  if (!escola) throw new IdentidadeError(400, 'escola_invalida', 'escola não encontrada');

  try {
    const card = await prisma.knowledgeCard.create({
      data: {
        chave: input.chave,
        escolaId: input.escolaId,
        empresaId,
        titulo: input.titulo,
        principio: input.principio,
        quandoUsar: input.quandoUsar,
        quandoNaoUsar: input.quandoNaoUsar,
        exemplo: input.exemplo ?? null,
        tipoFonte: input.tipoFonte,
        fonte: input.fonte ?? null,
        autor: input.autor ?? null,
        referencia: input.referencia ?? null,
        licenca: input.licenca ?? 'REVISAR',
        notaProvenance: input.notaProvenance ?? null,
        audience: input.audience ?? 'SELLER',
        origemEditorial: origemInterna?.origemEditorial ?? 'ADMIN_CURATED',
        tags: tags as Prisma.InputJsonValue,
        status: 'DRAFT',
        createdBy: ator.vendedorId,
      },
    });

    await registrarEventoAuditoria({
      empresaId: ator.empresaId,
      acao: 'CONTENT_CREATED',
      actorId: ator.vendedorId,
      // O id vai no metadata, nunca em `targetId` — `AuditEvent.targetId` é FK
      // pra `Vendedor.id` (bug já cometido e corrigido na Fatia 7.5D). E nunca
      // o conteúdo completo: o log de auditoria registra o ato, não o texto.
      metadata: { tipo: 'knowledge_card', id: card.id, chave: card.chave },
    });
    return card;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new IdentidadeError(409, 'chave_duplicada', `já existe um card com a chave "${input.chave}" neste escopo`);
    }
    throw err;
  }
}

/**
 * Busca um card garantindo o escopo do ator — o `findUnique` por id, sozinho,
 * é IDOR esperando acontecer.
 *
 * Card global (`empresaId: null`) é legível por qualquer empresa: é
 * conhecimento de plataforma. Card de empresa, só pela dona.
 */
async function buscarNoEscopo(id: string, ator: AtorAdministrativo) {
  const card = await prisma.knowledgeCard.findFirst({
    where: { id, OR: [{ empresaId: ator.empresaId }, { empresaId: null }] },
  });
  // Mesma mensagem pra "não existe" e "não é seu" — não confirmar existência de
  // recurso alheio é o padrão já usado nas conversas do Conselheiro.
  if (!card) throw new IdentidadeError(404, 'card_nao_encontrado', 'card de conhecimento não encontrado');
  return card;
}

/** Card de outra empresa nunca é editável; global não é editável por empresa. */
function assegurarPodeEscrever(card: { empresaId: string | null }, ator: AtorAdministrativo) {
  if (card.empresaId !== ator.empresaId) {
    throw new IdentidadeError(403, 'escopo_negado', 'este card não pertence à sua empresa');
  }
}

export type AtualizarKnowledgeCardInput = Partial<
  Pick<
    CriarKnowledgeCardInput,
    'titulo' | 'principio' | 'quandoUsar' | 'quandoNaoUsar' | 'exemplo' | 'tipoFonte' | 'fonte' | 'autor' | 'referencia' | 'licenca' | 'notaProvenance' | 'audience' | 'tags' | 'escolaId'
  >
>;

/**
 * Atualiza um card.
 *
 * Mudança SUBSTANTIVA num card já `PUBLISHED` incrementa a versão — mesma
 * regra que o CMS aplica a uma aula publicada, e pela mesma razão: conteúdo
 * ativo não pode mudar em silêncio. Aqui "substantivo" é o que mudaria o que o
 * Conselheiro diria (princípio, quando usar, quando não usar, exemplo, tipo de
 * fonte, escola); ajustar uma tag ou corrigir a grafia do autor não é.
 *
 * `status`, `approvedBy`, `publishedAt`, `version`, `createdBy` e `empresaId`
 * **não são atualizáveis por aqui** — estado editorial muda só por transição, e
 * escopo não muda nunca.
 */
export async function atualizarCard(id: string, dados: AtualizarKnowledgeCardInput, ator: AtorAdministrativo) {
  const atual = await buscarNoEscopo(id, ator);
  assegurarPodeEscrever(atual, ator);

  exigirTamanho('titulo', dados.titulo);
  exigirTamanho('principio', dados.principio);
  exigirTamanho('quandoUsar', dados.quandoUsar);
  exigirTamanho('quandoNaoUsar', dados.quandoNaoUsar);
  exigirTamanho('exemplo', dados.exemplo);
  exigirTamanho('fonte', dados.fonte);
  exigirTamanho('autor', dados.autor);
  exigirTamanho('referencia', dados.referencia);
  exigirTamanho('notaProvenance', dados.notaProvenance);

  // Provenance é revalidada com o estado RESULTANTE: trocar o tipo pra
  // CIENTIFICO sem fonte, ou limpar a fonte de um card já científico, são a
  // mesma falha vista de dois ângulos.
  validarProvenance({
    tipoFonte: dados.tipoFonte ?? atual.tipoFonte,
    fonte: dados.fonte !== undefined ? dados.fonte : atual.fonte,
    autor: dados.autor !== undefined ? dados.autor : atual.autor,
  });

  if (dados.tipoFonte === 'OFICIAL_EMPRESA' && atual.empresaId === null) {
    throw new IdentidadeError(400, 'oficial_exige_empresa', 'conteúdo oficial de empresa não pode ser global');
  }
  if (dados.escolaId && !(await prisma.escolaUniversidade.findUnique({ where: { id: dados.escolaId } }))) {
    throw new IdentidadeError(400, 'escola_invalida', 'escola não encontrada');
  }

  const mudouSubstantivo = CAMPOS_SUBSTANTIVOS.some((campo) => dados[campo] !== undefined && dados[campo] !== atual[campo]);
  const precisaNovaVersao = mudouSubstantivo && atual.status === 'PUBLISHED';

  // ALLOWLIST EXPLÍCITA, nunca `...dados`.
  //
  // O tipo `AtualizarKnowledgeCardInput` só existe em tempo de compilação:
  // espalhar o objeto recebido deixava um `status: 'PUBLISHED'` ou um
  // `approvedBy` qualquer chegarem intactos ao banco. Medido antes de corrigir
  // — um payload com esses campos publicava o card, forjava o aprovador e
  // fixava a versão em 99, pulando o ciclo editorial inteiro. Hoje não há rota
  // HTTP, mas a 2C.2/2C.5 vai criar uma, e o buraco estaria esperando.
  const permitidos: Prisma.KnowledgeCardUpdateInput = {};
  if (dados.titulo !== undefined) permitidos.titulo = dados.titulo;
  if (dados.principio !== undefined) permitidos.principio = dados.principio;
  if (dados.quandoUsar !== undefined) permitidos.quandoUsar = dados.quandoUsar;
  if (dados.quandoNaoUsar !== undefined) permitidos.quandoNaoUsar = dados.quandoNaoUsar;
  if (dados.exemplo !== undefined) permitidos.exemplo = dados.exemplo;
  if (dados.tipoFonte !== undefined) permitidos.tipoFonte = dados.tipoFonte;
  if (dados.fonte !== undefined) permitidos.fonte = dados.fonte;
  if (dados.autor !== undefined) permitidos.autor = dados.autor;
  if (dados.referencia !== undefined) permitidos.referencia = dados.referencia;
  if (dados.licenca !== undefined) permitidos.licenca = dados.licenca;
  if (dados.notaProvenance !== undefined) permitidos.notaProvenance = dados.notaProvenance;
  if (dados.audience !== undefined) permitidos.audience = dados.audience;
  if (dados.escolaId !== undefined) permitidos.escola = { connect: { id: dados.escolaId } };
  if (dados.tags !== undefined) permitidos.tags = validarTags(dados.tags) as Prisma.InputJsonValue;
  if (precisaNovaVersao) permitidos.version = { increment: 1 };

  const card = await prisma.knowledgeCard.update({ where: { id }, data: permitidos });

  await registrarEventoAuditoria({
    empresaId: ator.empresaId,
    acao: 'CONTENT_UPDATED',
    actorId: ator.vendedorId,
    metadata: { tipo: 'knowledge_card', id, novaVersao: precisaNovaVersao, substantivo: mudouSubstantivo },
  });
  return card;
}

/**
 * Aplica uma transição editorial.
 *
 * `updateMany` condicional — nunca ler-então-escrever: duas aprovações
 * concorrentes não produzem duas transições. Mesmo padrão do CMS e da máquina
 * de estado das intervenções do Conselheiro.
 *
 * `approvedBy` sai do ator autenticado no momento da publicação. **Não existe
 * parâmetro para informá-lo** — um aprovador forjado não tem por onde entrar.
 */
export async function transicionarCard(id: string, transicao: TransicaoCard, ator: AtorAdministrativo) {
  const atual = await buscarNoEscopo(id, ator);
  assegurarPodeEscrever(atual, ator);

  const regra = TRANSICOES[transicao];
  const resultado = await prisma.knowledgeCard.updateMany({
    where: { id, empresaId: ator.empresaId, status: { in: regra.de } },
    data: {
      status: regra.para,
      ...(regra.para === 'PUBLISHED' ? { publishedAt: new Date(), approvedBy: ator.vendedorId } : {}),
    },
  });

  if (resultado.count !== 1) {
    throw new IdentidadeError(409, 'transicao_invalida', `card não está em um estado válido para "${transicao}" (estado atual: ${atual.status})`);
  }

  await registrarEventoAuditoria({
    empresaId: ator.empresaId,
    acao: ACAO_POR_TRANSICAO[transicao],
    actorId: ator.vendedorId,
    metadata: { tipo: 'knowledge_card', id, de: atual.status, para: regra.para },
  });
  return prisma.knowledgeCard.findUniqueOrThrow({ where: { id } });
}

/** Listagem administrativa — só o escopo do ator, mais o conhecimento global. */
export async function listarCards(ator: AtorAdministrativo, filtros: { status?: StatusConteudo; escolaId?: string } = {}) {
  return prisma.knowledgeCard.findMany({
    where: {
      OR: [{ empresaId: ator.empresaId }, { empresaId: null }],
      ...(filtros.status ? { status: filtros.status } : {}),
      ...(filtros.escolaId ? { escolaId: filtros.escolaId } : {}),
    },
    orderBy: [{ status: 'asc' }, { chave: 'asc' }],
  });
}

export { buscarNoEscopo as buscarCard };

/**
 * Os cards que PODERIAM ser usados numa conversa — a fundação do retriever.
 *
 * **Isto não é o retriever.** Não recebe mensagem, não escolhe card, não fala
 * com o Conselheiro; nada nesta fatia a chama no caminho de uma conversa. Ela
 * existe porque a invariante "só o publicado é elegível" precisa ser provável
 * agora, não depois — foi exatamente um gate de publicação esquecido num
 * segundo ponto de leitura que produziu o achado HIGH da Fatia 7.5C.
 *
 * O escopo é o mesmo da leitura administrativa: o conhecimento da empresa mais
 * o global. Conteúdo arquivado ou em rascunho nunca entra.
 */
export async function listarElegiveis(
  empresaId: string,
  filtros: { escolaId?: string; audience?: PublicoConteudo; tipoFonte?: TipoFonteConhecimento[] } = {}
) {
  return prisma.knowledgeCard.findMany({
    where: {
      status: 'PUBLISHED',
      OR: [{ empresaId }, { empresaId: null }],
      ...(filtros.escolaId ? { escolaId: filtros.escolaId } : {}),
      ...(filtros.audience ? { audience: { in: [filtros.audience, 'BOTH'] } } : {}),
      ...(filtros.tipoFonte?.length ? { tipoFonte: { in: filtros.tipoFonte } } : {}),
    },
    // `chave` NÃO é ordem total aqui: ela é única por escopo, então um card
    // global e um da empresa podem compartilhar a mesma chave — que é
    // exatamente o caso de override. `id` fecha a ordem.
    orderBy: [{ chave: 'asc' }, { id: 'asc' }],
    // BOUNDED (Etapa 2C.2): sem teto, uma escola com muito conteúdo carregaria
    // o catálogo inteiro pra devolver um card só. O teto é de segurança, não de
    // produto — quem consome escolhe UM, e uma escola que encoste nele é sinal
    // de que o filtro precisa ser mais estreito, não de que falta espaço.
    take: MAX_CANDIDATOS,
  });
}

/**
 * Teto de candidatos carregados numa recuperação.
 *
 * Calibrado pelo tamanho real do corpus medido na 2C.0 (37 unidades de texto
 * no produto inteiro): 50 é uma ordem de grandeza acima do que uma escola
 * deve ter, e mesmo assim a consulta continua trivial.
 */
export const MAX_CANDIDATOS = 50;
