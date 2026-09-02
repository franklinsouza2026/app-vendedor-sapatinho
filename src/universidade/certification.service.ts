// Certification (Fatia 7.5E, seção 45-49) — backend é a única autoridade de
// emissão (seção 47: "nunca frontend decide emissão"). Idempotência via
// constraint única (userId, definitionId, definitionVersion) + create/catch
// P2002 (mesmo padrão desde a Fatia 4) — nunca 2 emissões pra mesma versão.
import { Prisma, PublicoConteudo, StatusConteudo, TipoRequisitoCertificacao } from '@prisma/client';
import { prisma } from '../db';
import { registrarEventoAuditoria } from '../identidade/auditoria.service';
import { resolverEmpresaUnica } from './schools.service';
import { UniversidadeError } from './constantes';
import { calcularScoreCompetencia } from './score-engine.service';
import { checarCompletudeMandamentos } from '../academia/mandamentos.service';
import { publicarEventoFeed } from '../competicoes/feed.service';
import { createLogger } from '../utils/logger';

const log = createLogger('universidade:certification');

export async function criarCertificationDefinition(
  dados: { code: string; name: string; description: string; audience?: PublicoConteudo; validityMonths?: number },
  actorId: string
) {
  const def = await prisma.certificationDefinition.create({ data: { ...dados, createdBy: actorId } });
  await registrarEventoAuditoria({ empresaId: await resolverEmpresaUnica(), acao: 'CERTIFICATION_DEFINITION_CREATED', actorId, metadata: { definitionId: def.id } });
  return def;
}

export async function listarCertificationDefinitions() {
  return prisma.certificationDefinition.findMany({ orderBy: { createdAt: 'desc' }, include: { requisitos: true } });
}

export async function buscarCertificationDefinition(id: string) {
  const def = await prisma.certificationDefinition.findUnique({ where: { id }, include: { requisitos: true } });
  if (!def) throw new UniversidadeError('not_found', 'certificação não encontrada');
  return def;
}

/** Editar requisitos de uma certificação JÁ publicada bump a versão (mesmo
 * princípio de versionamento do CMS, Fatia 7.5C) — emissões antigas
 * continuam válidas pra versão que existia quando foram emitidas; uma
 * "recertificação" (seção 49) é emitir de novo contra a versão nova. */
export async function definirRequisitos(definitionId: string, requisitos: { tipo: TipoRequisitoCertificacao; refId?: string; minScore?: number }[], actorId: string) {
  const atual = await buscarCertificationDefinition(definitionId);

  await prisma.$transaction(async (tx) => {
    await tx.certificationRequirement.deleteMany({ where: { definitionId } });
    await tx.certificationRequirement.createMany({ data: requisitos.map((r) => ({ definitionId, ...r })) });
    if (atual.status === 'PUBLISHED') {
      await tx.certificationDefinition.update({ where: { id: definitionId }, data: { version: { increment: 1 } } });
    }
  });

  await registrarEventoAuditoria({ empresaId: await resolverEmpresaUnica(), acao: 'CERTIFICATION_DEFINITION_UPDATED', actorId, metadata: { definitionId } });
  return buscarCertificationDefinition(definitionId);
}

const TRANSICOES: Record<'submeter' | 'aprovar' | 'publicar' | 'arquivar', { de: StatusConteudo[]; para: StatusConteudo }> = {
  submeter: { de: ['DRAFT'], para: 'REVIEW_PENDING' },
  aprovar: { de: ['REVIEW_PENDING'], para: 'APPROVED' },
  publicar: { de: ['APPROVED'], para: 'PUBLISHED' },
  arquivar: { de: ['DRAFT', 'REVIEW_PENDING', 'APPROVED', 'PUBLISHED'], para: 'ARCHIVED' },
};

export async function transicionarCertificationDefinition(id: string, transicao: keyof typeof TRANSICOES, actorId: string) {
  const regra = TRANSICOES[transicao];
  const atual = await buscarCertificationDefinition(id);
  const resultado = await prisma.certificationDefinition.updateMany({ where: { id, status: { in: regra.de } }, data: { status: regra.para } });
  if (resultado.count !== 1) throw new UniversidadeError('invalid_transition', `certificação não está em um estado válido para "${transicao}" (estado atual: ${atual.status})`);
  await registrarEventoAuditoria({ empresaId: await resolverEmpresaUnica(), acao: 'CERTIFICATION_DEFINITION_UPDATED', actorId, metadata: { definitionId: id, transicao } });
  return buscarCertificationDefinition(id);
}

export interface ResultadoElegibilidade {
  elegivel: boolean;
  pendencias: string[];
  evidenceSnapshot: Record<string, unknown>;
}

/** Avalia CADA requisito contra evidência real — nunca aceita `eligible:
 * true` vindo do cliente (seção 77). 13 Mandamentos (seção 50/54): se a
 * estrutura oficial não estiver completa, o requisito nunca passa,
 * independente de qualquer outra coisa. */
export async function avaliarElegibilidade(userId: string, definitionId: string): Promise<ResultadoElegibilidade> {
  const def = await buscarCertificationDefinition(definitionId);
  if (def.status !== 'PUBLISHED') return { elegivel: false, pendencias: ['certificação não está publicada'], evidenceSnapshot: {} };

  const pendencias: string[] = [];
  const snapshot: Record<string, unknown> = {};

  for (const req of def.requisitos) {
    switch (req.tipo) {
      case 'TRACK': {
        const progresso = await prisma.academyLesson.findMany({ where: { trackId: req.refId!, status: 'PUBLISHED', active: true }, include: { progresso: { where: { vendedorId: userId } } } });
        const completo = progresso.length > 0 && progresso.every((a) => a.progresso[0]?.status === 'COMPLETED');
        if (!completo) pendencias.push(`trilha ${req.refId} não concluída`);
        snapshot[`track_${req.refId}`] = completo;
        break;
      }
      case 'LESSON': {
        const progresso = await prisma.academyProgress.findUnique({ where: { vendedorId_lessonId: { vendedorId: userId, lessonId: req.refId! } } });
        const completo = progresso?.status === 'COMPLETED';
        if (!completo) pendencias.push(`aula ${req.refId} não concluída`);
        snapshot[`lesson_${req.refId}`] = completo;
        break;
      }
      case 'QUIZ_MIN_SCORE': {
        const progresso = await prisma.academyProgress.findUnique({ where: { vendedorId_lessonId: { vendedorId: userId, lessonId: req.refId! } } });
        const passou = progresso?.quizScore !== null && progresso?.quizScore !== undefined && progresso.quizScore >= (req.minScore ?? 0);
        if (!passou) pendencias.push(`quiz da aula ${req.refId} não atingiu ${req.minScore ?? 0}`);
        snapshot[`quiz_${req.refId}`] = progresso?.quizScore ?? null;
        break;
      }
      case 'SIMULATION': {
        const sessao = await prisma.simulationSession.findFirst({ where: { vendedorId: userId, scenarioId: req.refId!, status: 'EVALUATED' }, include: { avaliacoes: true } });
        const passou = !!sessao && (sessao.avaliacoes[0]?.scoreFinal ?? 0) >= (req.minScore ?? 0);
        if (!passou) pendencias.push(`simulação ${req.refId} não concluída com score suficiente`);
        snapshot[`simulation_${req.refId}`] = sessao?.avaliacoes[0]?.scoreFinal ?? null;
        break;
      }
      case 'COMPETENCY_TARGET': {
        const scoreInfo = await calcularScoreCompetencia(userId, req.refId!);
        const passou = scoreInfo.status === 'OK' && scoreInfo.score !== null && scoreInfo.score >= (req.minScore ?? 0);
        if (!passou) pendencias.push(`competência ${req.refId} abaixo de ${req.minScore ?? 0}`);
        snapshot[`competency_${req.refId}`] = scoreInfo.score;
        break;
      }
      case 'MANDAMENTOS_COMPLETOS': {
        const completude = await checarCompletudeMandamentos();
        if (!completude.completo) pendencias.push('13 Mandamentos ainda não têm conteúdo oficial completo cadastrado');
        snapshot.mandamentosCompletos = completude.completo;
        break;
      }
    }
  }

  return { elegivel: pendencias.length === 0, pendencias, evidenceSnapshot: snapshot };
}

/** Emissão idempotente (seção 48) — 2 requests concorrentes: só 1 cria a
 * linha, a 2ª recebe a já emitida (create + catch P2002). */
export async function emitirCertificacaoSeElegivel(userId: string, definitionId: string) {
  const def = await buscarCertificationDefinition(definitionId);
  const elegibilidade = await avaliarElegibilidade(userId, definitionId);
  if (!elegibilidade.elegivel) throw new UniversidadeError('requisitos_nao_atendidos', `requisitos pendentes: ${elegibilidade.pendencias.join('; ')}`);

  const expiresAt = def.validityMonths ? addMonths(new Date(), def.validityMonths) : null;

  try {
    const emitida = await prisma.userCertification.create({
      data: { userId, definitionId, definitionVersion: def.version, expiresAt, evidenceSnapshot: elegibilidade.evidenceSnapshot as Prisma.InputJsonValue },
    });
    await registrarEventoAuditoria({ empresaId: await resolverEmpresaUnica(), acao: 'CERTIFICATION_ISSUED', actorId: userId, metadata: { certificationId: emitida.id, definitionId } });
    // Feed (Fatia 8, seção 70) — best-effort, nunca bloqueia a emissão real.
    try {
      const vendedor = await prisma.vendedor.findUnique({ where: { id: userId }, select: { lojaId: true } });
      if (vendedor) await publicarEventoFeed({ eventType: 'CERTIFICATION_ISSUED', sourceType: 'USER_CERTIFICATION', sourceId: emitida.id, visibility: 'STORE', lojaId: vendedor.lojaId, subjectId: userId, templateData: { certificationName: def.name } });
    } catch (err) {
      log.error({ err, userId, definitionId }, 'falha ao publicar feed de certificação — não bloqueia a emissão');
    }
    return emitida;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return prisma.userCertification.findUniqueOrThrow({ where: { userId_definitionId_definitionVersion: { userId, definitionId, definitionVersion: def.version } } });
    }
    throw err;
  }
}

function addMonths(data: Date, meses: number): Date {
  const nova = new Date(data);
  nova.setMonth(nova.getMonth() + meses);
  return nova;
}

export async function listarCertificacoesDoUsuario(userId: string) {
  const certs = await prisma.userCertification.findMany({ where: { userId }, include: { definicao: true }, orderBy: { issuedAt: 'desc' } });
  const agora = new Date();
  return certs.map((c) => ({ ...c, status: recalcularStatus(c, agora) }));
}

function recalcularStatus(cert: { expiresAt: Date | null }, agora: Date): 'VALID' | 'EXPIRING' | 'EXPIRED' {
  if (!cert.expiresAt) return 'VALID';
  const diasParaExpirar = (cert.expiresAt.getTime() - agora.getTime()) / (24 * 60 * 60 * 1000);
  if (diasParaExpirar < 0) return 'EXPIRED';
  if (diasParaExpirar <= 30) return 'EXPIRING';
  return 'VALID';
}

/** Roda sob demanda (mesmo padrão de avaliação de missões, Fatia 7) —
 * persiste o status recalculado pra refletir em qualquer listagem/relatório
 * sem precisar de um scheduler dedicado nesta fatia. */
export async function atualizarStatusExpiracao(userId: string, agora: Date = new Date()) {
  const certs = await prisma.userCertification.findMany({ where: { userId, status: { not: 'EXPIRED' } } });
  for (const c of certs) {
    const novoStatus = recalcularStatus(c, agora);
    if (novoStatus !== c.status) {
      await prisma.userCertification.update({ where: { id: c.id }, data: { status: novoStatus } });
      if (novoStatus === 'EXPIRED') {
        await registrarEventoAuditoria({ empresaId: await resolverEmpresaUnica(), acao: 'CERTIFICATION_EXPIRED', actorId: userId, metadata: { certificationId: c.id } });
      }
    }
  }
}
