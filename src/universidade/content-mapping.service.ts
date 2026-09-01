// Content → Competency mapping (Fatia 7.5E, seção 19-21) — Admin associa
// trilha/aula/questão/cenário/missão a 1+ competências. Sempre valida que
// os ids existem de verdade antes de gravar (nunca um id solto).
import { prisma } from '../db';
import { registrarEventoAuditoria } from '../identidade/auditoria.service';
import { resolverEmpresaUnica } from './schools.service';
import { UniversidadeError } from './constantes';

type TipoConteudoMapeavel = 'track' | 'lesson' | 'question' | 'simulation' | 'mission';

async function validarCompetencyIds(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const encontradas = await prisma.competency.count({ where: { id: { in: ids } } });
  if (encontradas !== new Set(ids).size) {
    throw new UniversidadeError('invalid_reference', 'um ou mais ids de competência não existem');
  }
}

export async function mapearCompetencias(tipo: TipoConteudoMapeavel, contentId: string, competencyIds: string[], actorId: string) {
  await validarCompetencyIds(competencyIds);
  const dados = { competencyIds };

  switch (tipo) {
    case 'track': {
      const atual = await prisma.academyTrack.findUnique({ where: { id: contentId } });
      if (!atual) throw new UniversidadeError('not_found', 'trilha não encontrada');
      await prisma.academyTrack.update({ where: { id: contentId }, data: dados });
      break;
    }
    case 'lesson': {
      const atual = await prisma.academyLesson.findUnique({ where: { id: contentId } });
      if (!atual) throw new UniversidadeError('not_found', 'aula não encontrada');
      await prisma.academyLesson.update({ where: { id: contentId }, data: dados });
      break;
    }
    case 'question': {
      const atual = await prisma.academyQuestion.findUnique({ where: { id: contentId } });
      if (!atual) throw new UniversidadeError('not_found', 'questão não encontrada');
      await prisma.academyQuestion.update({ where: { id: contentId }, data: dados });
      break;
    }
    case 'simulation': {
      const atual = await prisma.simulationScenario.findUnique({ where: { id: contentId } });
      if (!atual) throw new UniversidadeError('not_found', 'cenário não encontrado');
      await prisma.simulationScenario.update({ where: { id: contentId }, data: dados });
      break;
    }
    case 'mission': {
      const atual = await prisma.missionDefinition.findUnique({ where: { id: contentId } });
      if (!atual) throw new UniversidadeError('not_found', 'missão não encontrada');
      await prisma.missionDefinition.update({ where: { id: contentId }, data: dados });
      break;
    }
  }

  await registrarEventoAuditoria({
    empresaId: await resolverEmpresaUnica(),
    acao: 'CONTENT_COMPETENCY_MAPPED',
    actorId,
    metadata: { tipo, contentId, competencyIds },
  });
}

export async function atribuirEscolaATrilha(trackId: string, escolaId: string | null, actorId: string) {
  const atual = await prisma.academyTrack.findUnique({ where: { id: trackId } });
  if (!atual) throw new UniversidadeError('not_found', 'trilha não encontrada');
  if (escolaId) {
    const escola = await prisma.escolaUniversidade.findUnique({ where: { id: escolaId } });
    if (!escola) throw new UniversidadeError('invalid_reference', 'escola não encontrada');
  }
  await prisma.academyTrack.update({ where: { id: trackId }, data: { escolaId } });
  await registrarEventoAuditoria({ empresaId: await resolverEmpresaUnica(), acao: 'UNIVERSITY_SCHOOL_UPDATED', actorId, metadata: { trackId, escolaId } });
}
