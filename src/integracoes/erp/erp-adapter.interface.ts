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

export interface ResultadoTesteConexao {
  ok: boolean;
  mensagem: string;
}

export interface ErpAdapter {
  readonly provedor: 'LINX' | 'MOCK' | 'CONTROLADO';
  /** Eventos de venda/cancelamento/devolução ocorridos em [desde, ate]. */
  buscarEventos(consulta: ConsultaEventosErp): Promise<unknown[]>;
  testarConexao(consulta: Omit<ConsultaEventosErp, 'desde' | 'ate'>): Promise<ResultadoTesteConexao>;
}

/** Falha da integração com mensagem SEGURA para exibir/guardar (nunca credencial ou URL com segredo). */
export class ErroIntegracao extends Error {}
