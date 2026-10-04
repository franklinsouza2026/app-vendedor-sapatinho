// Templates GOVERNADOS de missão (D7). O template define a MECÂNICA (qual
// critério mede o progresso, com fatos de venda) e os LIMITES; o Admin só
// preenche parâmetros permitidos. Nenhuma fórmula livre, nenhum "complete" do
// cliente: o progresso é sempre calculado no servidor (avaliador.ts).
import { CriterioMissao } from '@prisma/client';
import { z } from 'zod';

export type UnidadeMissao = 'venda' | 'par' | 'dia' | 'reais';
export type TemplateId = 'SPRINT_META' | 'PRODUTO_SEMANA' | 'PONTA_ESTOQUE' | 'DESAFIO_PA' | 'CATEGORIA' | 'SUPERACAO' | 'CONSISTENCIA';

export interface Template {
  id: TemplateId;
  titulo: string;
  /** Unidade → critério que a mede. */
  criterios: Partial<Record<UnidadeMissao, CriterioMissao>>;
  exigeProdutos: boolean;
  parametros: z.ZodTypeAny;
}

export const TEMPLATES: Record<TemplateId, Template> = {
  SPRINT_META: { id: 'SPRINT_META', titulo: 'Sprint de Meta', criterios: { venda: 'VENDAS_PERIODO', reais: 'FATURAMENTO_PERIODO' }, exigeProdutos: false, parametros: z.object({}).strict() },
  PRODUTO_SEMANA: { id: 'PRODUTO_SEMANA', titulo: 'Produto da Semana', criterios: { par: 'PARES_PRODUTOS', venda: 'VENDAS_PRODUTOS' }, exigeProdutos: true, parametros: z.object({}).strict() },
  PONTA_ESTOQUE: { id: 'PONTA_ESTOQUE', titulo: 'Ponta de Estoque', criterios: { par: 'PARES_PRODUTOS', venda: 'VENDAS_PRODUTOS' }, exigeProdutos: true, parametros: z.object({}).strict() },
  DESAFIO_PA: { id: 'DESAFIO_PA', titulo: 'Desafio de PA', criterios: { venda: 'VENDAS_MULTIPAR' }, exigeProdutos: false, parametros: z.object({ minimoPares: z.number().int().min(2).max(10).default(2) }).strict() },
  CATEGORIA: { id: 'CATEGORIA', titulo: 'Categoria', criterios: { venda: 'VENDAS_CATEGORIA', par: 'PARES_CATEGORIA' }, exigeProdutos: false, parametros: z.object({ categoria: z.string().trim().min(1).max(60) }).strict() },
  SUPERACAO: { id: 'SUPERACAO', titulo: 'Superação Pessoal', criterios: { dia: 'DIAS_TICKET_ACIMA' }, exigeProdutos: false, parametros: z.object({ ticketMinimo: z.number().positive().max(1_000_000) }).strict() },
  CONSISTENCIA: { id: 'CONSISTENCIA', titulo: 'Consistência', criterios: { dia: 'DIAS_META_SEGUIDOS' }, exigeProdutos: false, parametros: z.object({}).strict() },
};

export const TIPOS_EXIBICAO = ['DIARIA', 'SEMANAL', 'CATEGORIA', 'PERFORMANCE', 'CONSISTENCIA', 'PRODUTO_SEMANA', 'PONTA_ESTOQUE'] as const;

/** Limites governados. */
export const LIMITES = { alvoMax: 10_000, recompensaMax: 1000, periodoMaxDias: 92 } as const;
