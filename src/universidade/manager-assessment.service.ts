// ManagerAssessment (Fatia 7.5E, seção 27-28) — nunca atualizada
// silenciosamente: uma correção é sempre uma NOVA linha (version+1), a
// anterior permanece intacta pra sempre (auditoria/histórico).
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { registrarEventoAuditoria } from '../identidade/auditoria.service';
import { resolverEmpresaUnica } from './schools.service';
import { gerarEvidenciaDeAvaliacaoGerente } from './evidence.service';
import { buscarCompetencia } from './competency.service';
import { UniversidadeError } from './constantes';

const MAX_TENTATIVAS_VERSION = 5;

export async function registrarAvaliacaoGerente(params: { subjectUserId: string; competencyId: string; authorId: string; rating: number; evidenceNote?: string }) {
  if (params.rating < 1 || params.rating > 5) throw new UniversidadeError('invalid_reference', 'rating precisa estar entre 1 e 5');
  // Guarda redundante (achado do security review, seção 100) — a checagem
  // de escopo em papel:'VENDEDOR' já impede isso na rota real, mas nunca
  // confiar só nisso: uma avaliação nunca pode ser sobre o próprio autor.
  if (params.authorId === params.subjectUserId) throw new UniversidadeError('forbidden', 'não é possível registrar autoavaliação como avaliação de gerente');
  await buscarCompetencia(params.competencyId);

  // Retry sob colisão de version (achado da auditoria seção 79): 2
  // avaliações concorrentes podiam ler a mesma "última versão" e tentar
  // criar com o mesmo número — a constraint única (subjectUserId,
  // competencyId, version) barra a 2ª gravação, que aqui recalcula a
  // versão real e tenta de novo, em vez de perder a avaliação.
  let avaliacao;
  for (let tentativa = 1; ; tentativa++) {
    const ultima = await prisma.managerAssessment.findFirst({
      where: { subjectUserId: params.subjectUserId, competencyId: params.competencyId },
      orderBy: { version: 'desc' },
    });
    try {
      avaliacao = await prisma.managerAssessment.create({
        data: {
          subjectUserId: params.subjectUserId,
          competencyId: params.competencyId,
          authorId: params.authorId,
          rating: params.rating,
          evidenceNote: params.evidenceNote,
          version: (ultima?.version ?? 0) + 1,
        },
      });
      break;
    } catch (err) {
      const colisao = err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
      if (!colisao || tentativa >= MAX_TENTATIVAS_VERSION) throw err;
    }
  }

  await registrarEventoAuditoria({ empresaId: await resolverEmpresaUnica(), acao: 'MANAGER_ASSESSMENT_CREATED', actorId: params.authorId, metadata: { assessmentId: avaliacao.id, subjectUserId: params.subjectUserId } });
  await gerarEvidenciaDeAvaliacaoGerente(params.subjectUserId, params.competencyId, avaliacao.id, params.rating);

  return avaliacao;
}

export async function listarAvaliacoesDoUsuario(subjectUserId: string) {
  return prisma.managerAssessment.findMany({ where: { subjectUserId }, orderBy: { createdAt: 'desc' } });
}
