// Configuração da experiência da Fase 1 por empresa (Admin, sem terminal):
// rankings visíveis, métrica da "Corrida do Mês", Loja × Loja, indicadores
// liberados ao vendedor e tipos de evento do feed. Sem linha = padrão abaixo.
import { z } from 'zod';
import { prisma } from '../db';
import { registrarEventoAuditoria } from '../identidade/auditoria.service';
import { invalido } from '../utils/erro-http';

export const METRICAS = ['SCORE', 'VENDAS', 'PERCENTUAL_META', 'EVOLUCAO', 'PA', 'TICKET', 'CONSISTENCIA'] as const;
export type Metrica = (typeof METRICAS)[number];

export const INDICADORES = ['VENDAS', 'QTD_VENDAS', 'PARES', 'TICKET', 'PA', 'PERCENTUAL_META', 'SCORE', 'EVOLUCAO', 'CONSISTENCIA', 'CONVERSAO'] as const;
export type Indicador = (typeof INDICADORES)[number];

export const TIPOS_FEED = ['POSICAO', 'META', 'RECORDE', 'MISSAO', 'CONQUISTA', 'LOJA', 'COMPETICAO', 'RECONHECIMENTO'] as const;
export type TipoFeedFase1 = (typeof TIPOS_FEED)[number];

export const FORMULAS_LOJA = ['PCT_META_COLETIVA', 'MEDIA_SCORE', 'EVOLUCAO_COLETIVA'] as const;

/** Fonte de cada indicador — FATO do produto, não opinião do Admin: CONVERSAO não tem fonte (não há registro de atendimento sem venda). */
export const FONTE_INDICADOR: Record<Indicador, 'CONFIAVEL' | 'PARCIAL' | 'SEM_FONTE'> = {
  VENDAS: 'CONFIAVEL',
  QTD_VENDAS: 'CONFIAVEL',
  PARES: 'CONFIAVEL',
  TICKET: 'CONFIAVEL',
  PA: 'CONFIAVEL',
  PERCENTUAL_META: 'CONFIAVEL',
  SCORE: 'CONFIAVEL',
  EVOLUCAO: 'CONFIAVEL',
  CONSISTENCIA: 'CONFIAVEL',
  CONVERSAO: 'SEM_FONTE',
};

export interface ConfigFase1 {
  metricasRanking: Metrica[];
  metricaCorrida: Metrica;
  lojaXLoja: { ativo: boolean; formula: (typeof FORMULAS_LOJA)[number] | null; lojas: string[] };
  indicadores: Record<Indicador, boolean>;
  feedTipos: Record<TipoFeedFase1, boolean>;
  atualizadoEm: Date | null;
}

export const CONFIG_PADRAO: ConfigFase1 = {
  metricasRanking: [...METRICAS],
  metricaCorrida: 'VENDAS',
  lojaXLoja: { ativo: false, formula: null, lojas: [] },
  indicadores: Object.fromEntries(INDICADORES.map((i) => [i, FONTE_INDICADOR[i] !== 'SEM_FONTE'])) as Record<Indicador, boolean>,
  feedTipos: Object.fromEntries(TIPOS_FEED.map((t) => [t, true])) as Record<TipoFeedFase1, boolean>,
  atualizadoEm: null,
};

export const configSchema = z
  .object({
    metricasRanking: z.array(z.enum(METRICAS)).min(1),
    metricaCorrida: z.enum(METRICAS),
    lojaXLoja: z.object({ ativo: z.boolean(), formula: z.enum(FORMULAS_LOJA).nullable(), lojas: z.array(z.string().uuid()).max(500) }),
    indicadores: z.record(z.enum(INDICADORES), z.boolean()),
    feedTipos: z.record(z.enum(TIPOS_FEED), z.boolean()),
  })
  .strict()
  .refine((c) => c.metricasRanking.includes(c.metricaCorrida), { message: 'A métrica da corrida precisa estar entre as métricas ativas.' })
  .refine((c) => !c.lojaXLoja.ativo || c.lojaXLoja.formula !== null, { message: 'Loja × Loja ativo exige uma fórmula.' });

export async function obterConfigFase1(empresaId: string): Promise<ConfigFase1> {
  const linha = await prisma.configFase1.findUnique({ where: { empresaId } });
  if (!linha) return CONFIG_PADRAO;
  const indicadores = { ...CONFIG_PADRAO.indicadores, ...(linha.indicadores as Record<Indicador, boolean>) };
  // Indicador sem fonte NUNCA fica ligado, mesmo que alguém grave isso.
  for (const i of INDICADORES) if (FONTE_INDICADOR[i] === 'SEM_FONTE') indicadores[i] = false;
  return {
    metricasRanking: linha.metricasRanking.filter((m): m is Metrica => (METRICAS as readonly string[]).includes(m)),
    metricaCorrida: (METRICAS as readonly string[]).includes(linha.metricaCorrida) ? (linha.metricaCorrida as Metrica) : 'VENDAS',
    lojaXLoja: { ativo: linha.lojaXLojaAtivo, formula: (linha.lojaXLojaFormula as ConfigFase1['lojaXLoja']['formula']) ?? null, lojas: linha.lojaXLojaLojas },
    indicadores,
    feedTipos: { ...CONFIG_PADRAO.feedTipos, ...(linha.feedTipos as Record<TipoFeedFase1, boolean>) },
    atualizadoEm: linha.atualizadoEm,
  };
}

export async function salvarConfigFase1(empresaId: string, atorId: string, entrada: unknown): Promise<ConfigFase1> {
  const nova = configSchema.parse(entrada);
  if (nova.lojaXLoja.lojas.length) {
    const lojas = await prisma.loja.count({ where: { empresaId, id: { in: nova.lojaXLoja.lojas } } });
    if (lojas !== nova.lojaXLoja.lojas.length) throw invalido('Loja do Loja × Loja não pertence à empresa.');
  }
  const anterior = await obterConfigFase1(empresaId);
  const dados = {
    metricasRanking: nova.metricasRanking,
    metricaCorrida: nova.metricaCorrida,
    lojaXLojaAtivo: nova.lojaXLoja.ativo,
    lojaXLojaFormula: nova.lojaXLoja.formula,
    lojaXLojaLojas: nova.lojaXLoja.lojas,
    indicadores: nova.indicadores,
    feedTipos: nova.feedTipos,
    atualizadoPor: atorId,
  };
  await prisma.configFase1.upsert({ where: { empresaId }, create: { empresaId, ...dados }, update: dados });
  await registrarEventoAuditoria({ empresaId, acao: 'FASE1_CONFIG_UPDATED', actorId: atorId, metadata: { antes: { ...anterior, atualizadoEm: undefined }, depois: nova } });
  return obterConfigFase1(empresaId);
}
