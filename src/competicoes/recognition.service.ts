// Recognition (Fatia 8, seção 30-32) — puramente social; nunca altera
// KPI/score/resultado de competição (seção 31). RBAC (Manager só reconhece
// vendedor do próprio scope; Admin só da própria empresa) é decidido na ROTA,
// este service só persiste — sempre com o tenant explícito (Fase 1, D8).
import { TipoReconhecimento } from '@prisma/client';
import { prisma } from '../db';
import { registrarEventoAuditoria } from '../identidade/auditoria.service';
import { publicarEventoFeed } from './feed.service';
import { CompeticoesError } from './constantes';

const LIMITE_TEXTO_MENSAGEM = 500;
const LIMITE_TEXTO_TITULO = 120;

function textoPuro(texto: string | undefined, limite: number): string | undefined {
  if (!texto) return undefined;
  const limpo = texto.replace(/<[^>]*>/g, '').trim().slice(0, limite);
  return limpo.length ? limpo : undefined;
}

export async function registrarReconhecimento(params: { empresaId: string; authorId: string; subjectId: string; tipo: TipoReconhecimento; titulo?: string; message?: string; lojaId: string }) {
  if (params.authorId === params.subjectId) throw new CompeticoesError('forbidden', 'não é possível se autorreconhecer');
  // Texto puro, tamanho limitado (seção 78/107) — nunca HTML, nunca campo livre gigante.
  const mensagem = textoPuro(params.message, LIMITE_TEXTO_MENSAGEM);
  const titulo = textoPuro(params.titulo, LIMITE_TEXTO_TITULO);

  const reconhecimento = await prisma.recognition.create({ data: { empresaId: params.empresaId, authorId: params.authorId, subjectId: params.subjectId, tipo: params.tipo, titulo, message: mensagem } });
  await registrarEventoAuditoria({ empresaId: params.empresaId, acao: 'RECOGNITION_CREATED', actorId: params.authorId, targetId: params.subjectId, metadata: { recognitionId: reconhecimento.id, tipo: params.tipo } });
  await publicarEventoFeed({
    empresaId: params.empresaId,
    eventType: 'RECOGNITION_RECEIVED',
    sourceType: 'RECOGNITION',
    sourceId: reconhecimento.id,
    visibility: 'STORE',
    lojaId: params.lojaId,
    actorId: params.authorId,
    subjectId: params.subjectId,
    templateData: { recognitionTipo: params.tipo, titulo: titulo ?? null },
  });
  return reconhecimento;
}

export async function listarReconhecimentosRecebidos(subjectId: string, empresaId?: string) {
  return prisma.recognition.findMany({ where: { subjectId, ...(empresaId ? { empresaId } : {}) }, orderBy: { createdAt: 'desc' } });
}
