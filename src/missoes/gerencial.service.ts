// Missões do GERENTE (Fatia 9.6, seção 42-44) — mesmo motor de
// MissionAssignment/critério/recompensa dos vendedores (nunca um
// "ManagerMissionEngine v2"), só um catálogo e uma atribuição próprios,
// filtrados por `targetPapel: 'GERENTE'` — nunca lista as missões dos
// vendedores da loja pro gerente, nem o contrário.
import { inicioDoDia, inicioDaSemana } from '../services/metas.service';
import { prisma } from '../db';
import { fimDoDia, fimDaSemana, isViolacaoUnicidade } from './atribuicao.service';

/** Garante as missões diárias do gerente pra hoje — sempre todo o catálogo
 * ativo com `periodType: 'DIA'` (fundação simples, sem motor de
 * recomendação/priorização: são só 1-2 missões, nunca dezenas). */
export async function garantirMissoesGerenciaisDoDia(vendedorId: string, agora: Date = new Date()) {
  const vendedor = await prisma.vendedor.findUniqueOrThrow({ where: { id: vendedorId } });
  const hoje = inicioDoDia(agora);
  const definicoes = await prisma.missionDefinition.findMany({ where: { active: true, targetPapel: 'GERENTE', periodType: 'DIA' } });

  for (const definicao of definicoes) {
    try {
      await prisma.missionAssignment.create({
        data: { missionDefinitionId: definicao.id, empresaId: vendedor.empresaId, lojaId: vendedor.lojaId, vendedorId, startsAt: hoje, expiresAt: fimDoDia(hoje), progressoAlvo: 0 },
      });
    } catch (err) {
      if (!isViolacaoUnicidade(err)) throw err;
    }
  }

  return prisma.missionAssignment.findMany({ where: { vendedorId, startsAt: hoje }, include: { definicao: true }, orderBy: { createdAt: 'asc' } });
}

/** Garante as missões semanais do gerente (1:1, revisão de PDI) — mesma
 * disciplina de `garantirDesafiosDaSemana`: todo o catálogo ativo, sem
 * priorização. */
export async function garantirMissoesGerenciaisDaSemana(vendedorId: string, agora: Date = new Date()) {
  const vendedor = await prisma.vendedor.findUniqueOrThrow({ where: { id: vendedorId } });
  const inicioSemana = inicioDaSemana(agora);
  const definicoes = await prisma.missionDefinition.findMany({ where: { active: true, targetPapel: 'GERENTE', periodType: 'SEMANA' } });

  for (const definicao of definicoes) {
    try {
      await prisma.missionAssignment.create({
        data: { missionDefinitionId: definicao.id, empresaId: vendedor.empresaId, lojaId: vendedor.lojaId, vendedorId, startsAt: inicioSemana, expiresAt: fimDaSemana(inicioSemana), progressoAlvo: 0 },
      });
    } catch (err) {
      if (!isViolacaoUnicidade(err)) throw err;
    }
  }

  return prisma.missionAssignment.findMany({ where: { vendedorId, startsAt: inicioSemana }, include: { definicao: true }, orderBy: { createdAt: 'asc' } });
}

/** Todas as missões ativas do gerente (diárias + semanais), já garantidas. */
export async function getMissoesGerenciaisAtivas(vendedorId: string, agora: Date = new Date()) {
  const [diarias, semanais] = await Promise.all([garantirMissoesGerenciaisDoDia(vendedorId, agora), garantirMissoesGerenciaisDaSemana(vendedorId, agora)]);
  const todas = [...diarias, ...semanais].filter((m) => m.status === 'ASSIGNED' || m.status === 'IN_PROGRESS' || m.status === 'COMPLETED');
  return todas;
}
