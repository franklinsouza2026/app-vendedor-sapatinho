// CONTRATO DO ERP ADAPTER (Fase 1, D1/T3) — o único ponto por onde venda entra
// no Vendedor IA. A regra de negócio NUNCA conhece o ERP: Linx (futuro), mock
// (DEV) e controlado (testes/E2E) apenas produzem estes eventos. Tudo o mais
// (meta, ranking, missão, campanha, competição, XP, VendaCoins, recordes, feed)
// reage ao que entra por aqui, via src/fase1/vendas/ingestao.service.ts.
//
// Identificadores externos (loja, vendedor, venda, ajuste) são do ERP; o
// vínculo com loja/vendedor do Vendedor IA é feito pela integração
// (IntegracaoLoja / matrícula ERP / ExternalIdentity). `idExterno` é a CHAVE DE
// IDEMPOTÊNCIA: o mesmo evento entregue N vezes produz um único efeito.
import { z } from 'zod';

export const itemVendaErpSchema = z.object({
  referencia: z.string().trim().min(1).max(64),
  descricao: z.string().trim().min(1).max(200),
  categoria: z.string().trim().min(1).max(80).nullable().optional(),
  quantidade: z.number().int().positive().max(10_000),
  /** Quantos PARES o item representa (0 para bolsa/acessório). */
  pares: z.number().int().min(0).max(10_000),
  /** Valor total do item (já com desconto), em R$. */
  valor: z.number().min(0).max(10_000_000),
});

const instante = z.string().datetime({ offset: true });

export const eventoErpSchema = z.discriminatedUnion('tipo', [
  z.object({
    tipo: z.literal('VENDA'),
    idExterno: z.string().trim().min(1).max(120),
    lojaExterna: z.string().trim().min(1).max(64),
    vendedorExterno: z.string().trim().min(1).max(64),
    ocorridoEm: instante,
    valor: z.number().min(0).max(10_000_000),
    itens: z.array(itemVendaErpSchema).min(1).max(500),
  }),
  z.object({
    tipo: z.literal('CANCELAMENTO'),
    idExterno: z.string().trim().min(1).max(120),
    vendaIdExterno: z.string().trim().min(1).max(120),
    ocorridoEm: instante,
  }),
  z.object({
    tipo: z.literal('DEVOLUCAO'),
    idExterno: z.string().trim().min(1).max(120),
    vendaIdExterno: z.string().trim().min(1).max(120),
    ocorridoEm: instante,
    itens: z.array(itemVendaErpSchema).min(1).max(500),
  }),
]);

export type ItemVendaErp = z.infer<typeof itemVendaErpSchema>;
export type EventoErp = z.infer<typeof eventoErpSchema>;

export interface ConsultaEventosErp {
  integracaoId: string;
  empresaId: string;
  /** Códigos externos das lojas vinculadas à integração. */
  lojasExternas: string[];
  desde: Date;
  ate: Date;
  /** Credencial DECIFRADA só em memória, só durante a chamada. Nunca logar. */
  credencial: string | null;
  /** Configuração não sensível da integração (ex.: URL base). */
  configuracao: Record<string, unknown>;
}

/**
 * Cursor incremental de uma fonte (Linx L2). `valor` é o timestamp do Microvix:
 * um CONTADOR (rowversion do SQL Server), nunca data. Trafega como STRING de
 * dígitos para não perder precisão (pode passar de Number.MAX_SAFE_INTEGER).
 */
export interface CursorFonte {
  /** Método/consulta da fonte (ex.: 'LinxMovimento'). Cada um evolui sozinho. */
  metodo: string;
  /** Escopo do cursor: CNPJ/loja externa, ou '*' quando é por integração. */
  escopo: string;
  valor: string;
  fase: 'BACKFILL' | 'CATCH_UP' | 'LIVE';
}

/** Janela de datas (dia local da empresa, YYYY-MM-DD). É ESCOPO da consulta, não cursor. */
export interface JanelaConsulta {
  inicio: string;
  fim: string;
}

/** Consulta de um adapter incremental: cursores atuais + janela de reabertura. */
export interface ConsultaIncremental extends Omit<ConsultaEventosErp, 'desde' | 'ate'> {
  cursores: CursorFonte[];
  janela: JanelaConsulta;
  /** RECONCILIACAO: releitura de janela curta com cursores em memória — nunca grava cursor. */
  modo: 'INCREMENTAL' | 'RECONCILIACAO';
}

/**
 * Uma página de eventos de um adapter incremental. O adapter devolve os
 * cursores ATÉ ONDE os eventos desta página estão completos (um documento
 * cortado entre páginas não pode avançar o cursor além do seu início). O sync
 * só grava esses cursores depois de ingerir e reconciliar a página.
 */
export interface LoteIncremental {
  eventos: unknown[];
  cursores: { metodo: string; escopo: string; valor: string }[];
  /** true = a fonte tem mais páginas além desta. */
  haMais: boolean;
}

export interface ResultadoTesteConexao {
  ok: boolean;
  mensagem: string;
}

export interface ErpAdapter {
  readonly provedor: 'LINX' | 'MOCK' | 'CONTROLADO';
  /** Eventos de venda/cancelamento/devolução ocorridos em [desde, ate] (fontes por janela de data). */
  buscarEventos(consulta: ConsultaEventosErp): Promise<unknown[]>;
  /**
   * Fontes com cursor incremental (Linx Microvix): uma página por chamada. Se
   * existir, o sync usa ESTE caminho (cursor persistente), não `buscarEventos`.
   */
  buscarLote?(consulta: ConsultaIncremental): Promise<LoteIncremental>;
  testarConexao(consulta: Omit<ConsultaEventosErp, 'desde' | 'ate'>): Promise<ResultadoTesteConexao>;
}

/** Falha da integração com mensagem SEGURA para exibir/guardar (nunca credencial ou URL com segredo). */
export class ErroIntegracao extends Error {}
