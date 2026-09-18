// Reseta dados da Universidade (Fatia 7.5E) antes dos E2Es — competências/
// evidências/PDIs/certificações de teste, e o progresso de Academia que os
// E2Es desta fatia geram pra VEND001/VEND002. Roda só contra dev, nunca
// contra produção.
import { PrismaClient } from '@prisma/client';
import { seedCompetenciasV1 } from '../src/universidade/competency.service';
import { seedConteudoAcademia } from '../src/academia/content-seed';
import { seedCenariosSimulador } from '../src/simulador/scenario-seed';

const prisma = new PrismaClient();

async function main() {
  const vendedores = await prisma.vendedor.findMany({ where: { matriculaErp: { in: ['VEND001', 'VEND002'] } }, select: { id: true } });
  const ids = vendedores.map((v) => v.id);

  await prisma.competencyEvidence.deleteMany({ where: { subjectUserId: { in: ids } } });
  await prisma.developmentPlanItem.deleteMany({ where: { plano: { subjectUserId: { in: ids } } } });
  await prisma.developmentPlan.deleteMany({ where: { subjectUserId: { in: ids } } });
  await prisma.managerAssessment.deleteMany({ where: { subjectUserId: { in: ids } } });
  await prisma.userCertification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.reviewSchedule.deleteMany({ where: { userId: { in: ids } } });

  const competenciasTeste = await prisma.competency.findMany({ where: { code: { startsWith: 'e2e-' } }, select: { id: true } });
  const competenciaIds = competenciasTeste.map((c) => c.id);
  await prisma.competencyTarget.deleteMany({ where: { competencyId: { in: competenciaIds } } });
  await prisma.competency.deleteMany({ where: { id: { in: competenciaIds } } });

  await prisma.certificationRequirement.deleteMany({ where: { definicao: { code: { startsWith: 'e2e-' } } } });
  await prisma.certificationDefinition.deleteMany({ where: { code: { startsWith: 'e2e-' } } });

  // AcademyProgress da aula/quiz usados nos E2Es desta fatia (aula "Como
  // abrir bem um atendimento", código abrir-atendimento) — evita "já
  // concluído" contaminar uma segunda rodada no mesmo dia.
  const aula = await prisma.academyLesson.findUnique({ where: { code: 'FUND_ABERTURA' } });
  if (aula) await prisma.academyProgress.deleteMany({ where: { vendedorId: { in: ids }, lessonId: aula.id } });

  // Restaura o mapeamento conteúdo→competência do seed.
  //
  // `jornada-universidade-vendedor.spec.ts` mapeia uma competência 'e2e-' na
  // aula FUND_ABERTURA pela API de Admin — e essa API SUBSTITUI a lista, não
  // acrescenta. Depois, a limpeza acima apaga a competência 'e2e-' e a aula
  // fica apontando pra um id que não existe mais: a cadeia de evidência morre
  // em silêncio no banco de dev, exatamente o estado que a auditoria
  // encontrou. Reaplicar o seed reconcilia (é upsert por code, não recria).
  // Garante o catálogo ANTES do conteúdo: seedar conteúdo sem competência
  // gravaria `competencyIds: []` em tudo (o campo vai no `update`) e devolveria
  // o motor ao estado inerte. `seedConteudoAcademia` recusa esse cenário, mas o
  // certo é não chegar nele.
  await seedCompetenciasV1();
  const academia = await seedConteudoAcademia();
  const cenarios = await seedCenariosSimulador();

  console.log(
    `Universidade E2E reset: limpo para ${ids.length} vendedor(es), ${competenciaIds.length} competência(s) de teste removida(s); ` +
      `mapeamento restaurado (${academia.aulasMapeadas} aula(s), ${cenarios.mapeados} cenário(s)).`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
