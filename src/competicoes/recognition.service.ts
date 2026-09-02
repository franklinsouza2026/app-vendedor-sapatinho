// Recognition (Fatia 8, seção 30-32) — puramente social; nunca altera
// KPI/score/resultado de competição (seção 31). RBAC (Manager só reconhece
// vendedor do próprio scope) é decidido na ROTA (mesmo padrão de
// manager-scope.service.ts da Universidade), este service só persiste.
import { TipoReconhecimento } from '@prisma/client';
import { prisma } from '../db';
import { registrarEventoAuditoria } from '../identidade/auditoria.service';
import { resolverEmpresaUnica } from '../universidade/schools.service';
import { publicarEventoFeed } from './feed.service';
import { CompeticoesError } from './constantes';

const LIMITE_TEXTO_MENSAGEM = 500;

export async function registrarReconhecimento(params: { authorId: string; subjectId: string; tipo: TipoReconhecimento; message?: string; lojaId: string }) {
  if (params.authorId === params.subjectId) throw new CompeticoesError('forbidden', 'não é possível se autorreconhecer');
  // Texto puro, tamanho limitado (seção 78/107) — nunca HTML, nunca campo livre gigante.
  const mensagem = params.message ? params.message.replace(/<[^>]*>/g, '').slice(0, LIMITE_TEXTO_MENSAGEM) : undefined;

  const reconhecimento = await prisma.recognition.create({ data: { authorId: params.authorId, subjectId: params.subjectId, tipo: params.tipo, message: mensagem } });
  await registrarEventoAuditoria({ empresaId: await resolverEmpresaUnica(), acao: 'RECOGNITION_CREATED', actorId: params.authorId, metadata: { recognitionId: reconhecimento.id, subjectId: params.subjectId, tipo: params.tipo } });
  await publicarEventoFeed({
    eventType: 'RECOGNITION_RECEIVED',
    sourceType: 'RECOGNITION',
    sourceId: reconhecimento.id,
    visibility: 'STORE',
    lojaId: params.lojaId,
    actorId: params.authorId,
    subjectId: params.subjectId,
    templateData: { recognitionTipo: params.tipo },
  });
  return reconhecimento;
}

export async function listarReconhecimentosRecebidos(subjectId: string) {
  return prisma.recognition.findMany({ where: { subjectId }, orderBy: { createdAt: 'desc' } });
}
