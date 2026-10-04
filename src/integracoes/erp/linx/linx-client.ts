import { ErpAdapter, ErroIntegracao, ResultadoTesteConexao } from '../erp-adapter.interface';

/**
 * Adapter LINX — PONTO DE ENCAIXE, ainda NÃO implementado (decisão D1/§35 da
 * convergência: a integração Linx real é a PRÓXIMA etapa, depois de frontend,
 * backend, segurança e E2E estarem GREEN).
 *
 * O que a etapa Linx precisa entregar aqui, sem mudar nada fora deste arquivo:
 *   buscarEventos → traduzir o que a API Linx devolve para EventoErp
 *   (VENDA com itens/pares/referência/categoria, CANCELAMENTO, DEVOLUCAO),
 *   usando `consulta.credencial` (decifrada só em memória) e
 *   `consulta.configuracao` (URL base etc.).
 *
 * A versão anterior chamava um endpoint INVENTADO com campos supostos; foi
 * removida para que nenhum dado inventado entre no sistema por engano.
 */
export class LinxErpAdapter implements ErpAdapter {
  readonly provedor = 'LINX' as const;

  async buscarEventos(): Promise<unknown[]> {
    throw new ErroIntegracao('Integração Linx preparada, mas ainda não conectada — etapa de integração Linx pendente.');
  }

  async testarConexao(): Promise<ResultadoTesteConexao> {
    return { ok: false, mensagem: 'Integração Linx preparada, mas ainda não conectada — etapa de integração Linx pendente.' };
  }
}
