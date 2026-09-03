// MissionAssignmentService (Fatia 7, seção 5/13/25). Atribuição é sempre
// feita pelo SISTEMA (nunca o vendedor escolhe/cria a própria missão —
// seção 43, RBAC). Idempotente via a constraint única
// [vendedorId, missionDefinitionId, startsAt] — reprocessar o mesmo dia/
// semana nunca duplica nem cria uma segunda janela ativa.
//
// `create()` + catch P2002 (não `upsert`): sob concorrência real, o
// `upsert` do Prisma ainda pode disparar a violação de unique constraint em
// vez de resolver graciosamente pro `update` (confirmado por teste de
// concorrência) — mesma lição já aplicada em CoachConversation/
// TrainerConversation/SimulationSession (Fatias 4-6): tratar a corrida como
// caminho normal, nunca deixar o erro subir pro vendedor.
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { inicioDoDia, inicioDaSemana } from '../services/metas.service';
import { recomendarMissoesDoDia } from './recomendacao.service';

export function fimDoDia(inicio: Date): Date {
  const fim = new Date(inicio);
  fim.setDate(fim.getDate() + 1);
  return fim;
}

export function fimDaSemana(inicio: Date): Date {
  const fim = new Date(inicio);
  fim.setDate(fim.getDate() + 7);
  return fim;
}

export function isViolacaoUnicidade(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

/** Garante as missões diárias do vendedor pra hoje (até MISSOES_MAX_ATIVAS_POR_DIA, por prioridade). */
export async function garantirMissoesDoDia(vendedorId: string, agora: Date = new Date()) {
  const vendedor = await prisma.vendedor.findUniqueOrThrow({ where: { id: vendedorId } });
  const hoje = inicioDoDia(agora);
  const criteriosRecomendados = await recomendarMissoesDoDia(vendedorId, agora);

  for (const criterio of criteriosRecomendados) {
    const definicao = await prisma.missionDefinition.findFirst({ where: { criterionType: criterio, active: true } });
    if (!definicao) continue; // catálogo incompleto — não trava a atribuição das demais

    try {
      await prisma.missionAssignment.create({
        data: {
          missionDefinitionId: definicao.id,
          empresaId: vendedor.empresaId,
          lojaId: vendedor.lojaId,
          vendedorId,
          startsAt: hoje,
          expiresAt: fimDoDia(hoje),
          progressoAlvo: 0,
        },
      });
    } catch (err) {
      if (!isViolacaoUnicidade(err)) throw err;
      // já atribuída (por esta chamada ou uma concorrente) — idempotente, segue.
    }
  }

  return prisma.missionAssignment.findMany({
    where: { vendedorId, startsAt: hoje },
    include: { definicao: true },
    orderBy: { createdAt: 'asc' },
  });
}

/** Garante os desafios semanais do vendedor (todo o catálogo ativo — sem recomendação, é fundação simples). */
export async function garantirDesafiosDaSemana(vendedorId: string, agora: Date = new Date()) {
  const vendedor = await prisma.vendedor.findUniqueOrThrow({ where: { id: vendedorId } });
  const inicioSemana = inicioDaSemana(agora);
  const definicoes = await prisma.challengeDefinition.findMany({ where: { active: true } });

  for (const definicao of definicoes) {
    try {
      await prisma.challengeAssignment.create({
        data: {
          challengeDefinitionId: definicao.id,
          empresaId: vendedor.empresaId,
          lojaId: vendedor.lojaId,
          vendedorId,
          startsAt: inicioSemana,
          expiresAt: fimDaSemana(inicioSemana),
          progressoAlvo: 0,
        },
      });
    } catch (err) {
      if (!isViolacaoUnicidade(err)) throw err;
    }
  }

  return prisma.challengeAssignment.findMany({
    where: { vendedorId, startsAt: inicioSemana },
    include: { definicao: true },
    orderBy: { createdAt: 'asc' },
  });
}
