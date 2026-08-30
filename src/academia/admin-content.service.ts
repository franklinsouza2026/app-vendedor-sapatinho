// CMS de treinamento — gestão administrável de trilhas/aulas (Fatia 7.5C).
// Lifecycle editorial (DRAFT→REVIEW_PENDING→APPROVED→PUBLISHED→ARCHIVED,
// seção 10) sempre por transição atômica condicional (updateMany, nunca
// ler-então-escrever) — mesmo padrão de concorrência das Fatias 4-7.5A.
// Admin acumula os papéis de criador/revisor nesta fatia (seção 55): nada
// impede o mesmo Admin de chamar submeter→aprovar→publicar em sequência,
// mas cada transição continua sendo seu próprio passo auditado.
import { PublicoConteudo, StatusConteudo, TipoConteudoAula } from '@prisma/client';
import { prisma } from '../db';
import { registrarEventoAuditoria } from '../identidade/auditoria.service';
import { IdentidadeError } from '../identidade/erros';
import { urlDeMaterialPermitida, urlDeVideoPermitida } from './media-seguranca';

// Catálogo de treinamento é global (nunca por empresa — ver comentário no
// schema do AcademyTrack); AuditEvent exige um empresaId por causa da FK.
// Usa a única empresa deste deployment (mesmo raciocínio já documentado em
// src/routes/auth.ts pra GET /lojas — "cada instância pertence a exatamente
// 1 empresa", Decisão 1 do vault).
let empresaUnicaCache: string | null = null;
async function resolverEmpresaUnica(): Promise<string> {
  if (empresaUnicaCache) return empresaUnicaCache;
  const empresa = await prisma.empresa.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });
  empresaUnicaCache = empresa.id;
  return empresaUnicaCache;
}

const TRANSICOES_CONTEUDO = {
  submeter: { de: ['DRAFT'] as StatusConteudo[], para: 'REVIEW_PENDING' as StatusConteudo },
  aprovar: { de: ['REVIEW_PENDING'] as StatusConteudo[], para: 'APPROVED' as StatusConteudo },
  publicar: { de: ['APPROVED'] as StatusConteudo[], para: 'PUBLISHED' as StatusConteudo },
  arquivar: { de: ['DRAFT', 'REVIEW_PENDING', 'APPROVED', 'PUBLISHED'] as StatusConteudo[], para: 'ARCHIVED' as StatusConteudo },
};

type Transicao = keyof typeof TRANSICOES_CONTEUDO;

const ACAO_POR_TRANSICAO: Record<Transicao, 'CONTENT_SUBMITTED_FOR_REVIEW' | 'CONTENT_APPROVED' | 'CONTENT_PUBLISHED' | 'CONTENT_ARCHIVED'> = {
  submeter: 'CONTENT_SUBMITTED_FOR_REVIEW',
  aprovar: 'CONTENT_APPROVED',
  publicar: 'CONTENT_PUBLISHED',
  arquivar: 'CONTENT_ARCHIVED',
};

function validarUrlsAula(dados: { videoUrl?: string | null; materialUrl?: string | null }) {
  if (dados.videoUrl && !urlDeVideoPermitida(dados.videoUrl)) {
    throw new IdentidadeError(400, 'video_url_invalida', 'URL de vídeo precisa ser YouTube ou Vimeo (https)');
  }
  if (dados.materialUrl && !urlDeMaterialPermitida(dados.materialUrl)) {
    throw new IdentidadeError(400, 'material_url_invalida', 'URL de material precisa ser http(s) válida');
  }
}

// ===== Trilhas =====

export async function criarTrilha(
  dados: { code: string; title: string; description: string; audience?: PublicoConteudo; sortOrder?: number },
  actorId: string,
  // Só a Training Intelligence Platform (Fatia 7.5D) passa isso — nunca
  // exposto no schema zod das rotas HTTP manuais (`/admin/training/tracks`),
  // que sempre criam ADMIN_CURATED. Ver src/training-intelligence/orchestrator.service.ts.
  origemInterna?: { origemEditorial: 'AI_RESEARCHED' | 'AI_GENERATED' }
) {
  const trilha = await prisma.academyTrack.create({
    data: { ...dados, status: 'DRAFT', origemEditorial: origemInterna?.origemEditorial ?? 'ADMIN_CURATED', createdBy: actorId },
  });
  await registrarEventoAuditoria({ empresaId: await resolverEmpresaUnica(), acao: 'CONTENT_CREATED', actorId, metadata: { tipo: 'track', id: trilha.id } });
  return trilha;
}

export async function atualizarTrilha(
  id: string,
  dados: Partial<{ title: string; description: string; audience: PublicoConteudo; sortOrder: number; active: boolean }>,
  actorId: string
) {
  const trilha = await prisma.academyTrack.update({ where: { id }, data: dados });
  await registrarEventoAuditoria({ empresaId: await resolverEmpresaUnica(), acao: 'CONTENT_UPDATED', actorId, metadata: { tipo: 'track', id } });
  return trilha;
}

export async function transicionarTrilha(id: string, transicao: Transicao, actorId: string) {
  const regra = TRANSICOES_CONTEUDO[transicao];
  const atual = await prisma.academyTrack.findUniqueOrThrow({ where: { id } });

  const resultado = await prisma.academyTrack.updateMany({
    where: { id, status: { in: regra.de } },
    data: { status: regra.para, ...(regra.para === 'PUBLISHED' ? { publishedAt: new Date(), approvedBy: actorId } : {}) },
  });
  if (resultado.count !== 1) {
    throw new IdentidadeError(409, 'transicao_invalida', `trilha não está em um estado válido para "${transicao}" (estado atual: ${atual.status})`);
  }

  await registrarEventoAuditoria({ empresaId: await resolverEmpresaUnica(), acao: ACAO_POR_TRANSICAO[transicao], actorId, metadata: { tipo: 'track', id } });
  return prisma.academyTrack.findUniqueOrThrow({ where: { id } });
}

export async function listarTrilhasAdmin() {
  return prisma.academyTrack.findMany({ orderBy: [{ status: 'asc' }, { sortOrder: 'asc' }], include: { aulas: { select: { id: true, title: true, status: true } } } });
}

// ===== Aulas =====

export async function criarAula(
  dados: {
    trackId: string;
    code: string;
    title: string;
    description: string;
    content: string;
    estimatedMinutes: number;
    audience?: PublicoConteudo;
    tipoConteudo?: TipoConteudoAula;
    videoUrl?: string;
    materialUrl?: string;
    sortOrder?: number;
  },
  actorId: string,
  // Ver comentário equivalente em criarTrilha — só a Training Intelligence
  // Platform passa isso.
  origemInterna?: { origemEditorial: 'AI_RESEARCHED' | 'AI_GENERATED'; trainingJobId: string }
) {
  validarUrlsAula(dados);
  const aula = await prisma.academyLesson.create({
    data: {
      ...dados,
      status: 'DRAFT',
      origemEditorial: origemInterna?.origemEditorial ?? 'ADMIN_CURATED',
      trainingJobId: origemInterna?.trainingJobId,
      createdBy: actorId,
    },
  });
  await registrarEventoAuditoria({ empresaId: await resolverEmpresaUnica(), acao: 'CONTENT_CREATED', actorId, metadata: { tipo: 'lesson', id: aula.id } });
  return aula;
}

export async function atualizarAula(
  id: string,
  dados: Partial<{
    title: string;
    description: string;
    content: string;
    estimatedMinutes: number;
    audience: PublicoConteudo;
    tipoConteudo: TipoConteudoAula;
    videoUrl: string | null;
    materialUrl: string | null;
    sortOrder: number;
    active: boolean;
  }>,
  actorId: string
) {
  validarUrlsAula(dados);
  // Editar conteúdo relevante de uma aula já PUBLISHED bump a versão lógica
  // (seção 11) — nunca reescreve silenciosamente o que o vendedor já
  // estudou. Histórico de progresso (AcademyProgress) permanece ligado ao
  // mesmo lessonId (decisão registrada no vault: granularidade de versão é
  // "a aula mudou", não um snapshot completo por vendedor/tentativa).
  const atual = await prisma.academyLesson.findUniqueOrThrow({ where: { id } });
  const mudaConteudo = dados.content !== undefined || dados.videoUrl !== undefined || dados.materialUrl !== undefined;
  const precisaNovaVersao = mudaConteudo && atual.status === 'PUBLISHED';

  const aula = await prisma.academyLesson.update({
    where: { id },
    data: { ...dados, ...(precisaNovaVersao ? { version: { increment: 1 } } : {}) },
  });
  await registrarEventoAuditoria({
    empresaId: await resolverEmpresaUnica(),
    acao: 'CONTENT_UPDATED',
    actorId,
    metadata: { tipo: 'lesson', id, novaVersao: precisaNovaVersao },
  });
  return aula;
}

export async function transicionarAula(id: string, transicao: Transicao, actorId: string) {
  const regra = TRANSICOES_CONTEUDO[transicao];
  const atual = await prisma.academyLesson.findUniqueOrThrow({ where: { id } });

  const resultado = await prisma.academyLesson.updateMany({
    where: { id, status: { in: regra.de } },
    data: { status: regra.para, ...(regra.para === 'PUBLISHED' ? { publishedAt: new Date(), approvedBy: actorId } : {}) },
  });
  if (resultado.count !== 1) {
    throw new IdentidadeError(409, 'transicao_invalida', `aula não está em um estado válido para "${transicao}" (estado atual: ${atual.status})`);
  }

  await registrarEventoAuditoria({ empresaId: await resolverEmpresaUnica(), acao: ACAO_POR_TRANSICAO[transicao], actorId, metadata: { tipo: 'lesson', id } });
  return prisma.academyLesson.findUniqueOrThrow({ where: { id } });
}

export async function listarAulasAdmin(trackId?: string) {
  return prisma.academyLesson.findMany({ where: trackId ? { trackId } : undefined, orderBy: [{ status: 'asc' }, { sortOrder: 'asc' }] });
}

export async function dashboardTreinamento() {
  const [porStatusTrilha, porStatusAula, trilhasAtivas, quizzesAtivos, aulasSemQuiz] = await Promise.all([
    prisma.academyTrack.groupBy({ by: ['status'], _count: true }),
    prisma.academyLesson.groupBy({ by: ['status'], _count: true }),
    prisma.academyTrack.count({ where: { status: 'PUBLISHED', active: true } }),
    prisma.academyQuiz.count(),
    prisma.academyLesson.count({ where: { status: 'PUBLISHED', quiz: null } }),
  ]);

  return {
    trilhasPorStatus: Object.fromEntries(porStatusTrilha.map((s) => [s.status, s._count])),
    aulasPorStatus: Object.fromEntries(porStatusAula.map((s) => [s.status, s._count])),
    trilhasAtivas,
    quizzesAtivos,
    aulasSemQuiz,
  };
}
