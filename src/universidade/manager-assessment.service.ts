// ManagerAssessment (Fatia 7.5E, seção 27-28) — nunca atualizada
// silenciosamente: uma correção é sempre uma NOVA linha (version+1), a
// anterior permanece intacta pra sempre (auditoria/histórico).
import { prisma } from '../db';
import { registrarEventoAuditoria } from '../identidade/auditoria.service';
import { resolverEmpresaUnica } from './schools.service';
import { gerarEvidenciaDeAvaliacaoGerente } from './evidence.service';
import { buscarCompetencia } from './competency.service';
import { UniversidadeError } from './constantes';

export async function registrarAvaliacaoGerente(params: { subjectUserId: string; competencyId: string; authorId: string; rating: number; evidenceNote?: string }) {
  if (params.rating < 1 || params.rating > 5) throw new UniversidadeError('invalid_reference', 'rating precisa estar entre 1 e 5');
  // Guarda redundante (achado do security review, seção 100) — a checagem
  // de escopo em papel:'VENDEDOR' já impede isso na rota real, mas nunca
  // confiar só nisso: uma avaliação nunca pode ser sobre o próprio autor.
  if (params.authorId === params.subjectUserId) throw new UniversidadeError('forbidden', 'não é possível registrar autoavaliação como avaliação de gerente');
  await buscarCompetencia(params.competencyId);

  const ultima = await prisma.managerAssessment.findFirst({
    where: { subjectUserId: params.subjectUserId, competencyId: params.competencyId },
    orderBy: { version: 'desc' },
  });

  const avaliacao = await prisma.managerAssessment.create({
    data: {
      subjectUserId: params.subjectUserId,
      competencyId: params.competencyId,
      authorId: params.authorId,
      rating: params.rating,
      evidenceNote: params.evidenceNote,
      version: (ultima?.version ?? 0) + 1,
    },
  });

  await registrarEventoAuditoria({ empresaId: await resolverEmpresaUnica(), acao: 'MANAGER_ASSESSMENT_CREATED', actorId: params.authorId, metadata: { assessmentId: avaliacao.id, subjectUserId: params.subjectUserId } });
  await gerarEvidenciaDeAvaliacaoGerente(params.subjectUserId, params.competencyId, avaliacao.id, params.rating);

  return avaliacao;
}

export async function listarAvaliacoesDoUsuario(subjectUserId: string) {
  return prisma.managerAssessment.findMany({ where: { subjectUserId }, orderBy: { createdAt: 'desc' } });
}
