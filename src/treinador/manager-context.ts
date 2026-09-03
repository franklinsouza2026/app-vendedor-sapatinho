// TrainerContext do GERENTE (Fatia 9.6, seção 29) — mesmo Treinador/engine/
// tabelas do vendedor, só o CONTEXTO muda: nunca performance pessoal de
// vendas (PA/ticket/meta não fazem sentido pra quem não vende), sempre
// situação da loja + sinais da equipe, reaproveitando Store Summary/Team
// Overview já existentes (Fatia 9) — zero motor novo.
import { ModoTreinador } from '@prisma/client';
import { prisma } from '../db';
import { calcularStoreSummary } from '../manager/store-summary.service';
import { listarAlertas } from '../manager/alerts.service';

export interface ManagerTrainerContext {
  manager: { displayName: string };
  store: { name: string; percentualMetaMes: number | null; vendedoresAtivosHoje: number; totalVendedores: number };
  situacao: { alertasAbertos: number; tiposMaisFrequentes: string[] };
  request: { mode: ModoTreinador; situation: string | null };
}

export interface ResultadoManagerTrainerContext {
  context: ManagerTrainerContext;
  playbookId: null; // Treinador gerencial nunca usa o Playbook de atendimento (seção 29).
}

export async function buildManagerTrainerContext(
  vendedorId: string,
  entrada: { mode: ModoTreinador; situation?: string | null },
  agora: Date = new Date()
): Promise<ResultadoManagerTrainerContext> {
  const gerente = await prisma.vendedor.findUniqueOrThrow({ where: { id: vendedorId }, include: { loja: true } });

  const [storeSummary, alertas] = await Promise.all([
    calcularStoreSummary(gerente.empresaId, gerente.lojaId, agora),
    listarAlertas(gerente.empresaId, gerente.lojaId, { status: ['OPEN', 'ACKNOWLEDGED'] }),
  ]);

  const contagemPorTipo = new Map<string, number>();
  for (const a of alertas) contagemPorTipo.set(a.tipo, (contagemPorTipo.get(a.tipo) ?? 0) + 1);
  const tiposMaisFrequentes = [...contagemPorTipo.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([tipo]) => tipo);

  return {
    playbookId: null,
    context: {
      manager: { displayName: gerente.nome },
      store: {
        name: gerente.loja.nome,
        percentualMetaMes: storeSummary.percentualAtingido,
        vendedoresAtivosHoje: storeSummary.vendedoresAtivosHoje,
        totalVendedores: storeSummary.totalVendedores,
      },
      situacao: { alertasAbertos: alertas.length, tiposMaisFrequentes },
      request: { mode: entrada.mode, situation: entrada.situation ?? null },
    },
  };
}

export const MODOS_GERENCIAIS: ModoTreinador[] = ['LIDERANCA', 'FEEDBACK', 'REUNIAO_1A1', 'GESTAO_DE_CONFLITOS', 'DESENVOLVIMENTO_DE_EQUIPE'];
