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
    throw new ErroIntegracao('Integração Linx preparada, mas ainda não conectada — aguardando credencial e homologação do contrato Linx.');
  }

  // L2: o sync já tem o caminho incremental (`buscarLote`, cursor por timestamp
  // Microvix). O cliente real (LinxMovimento etc.) entra na L3, com a chave e a
  // amostra real — por isso este adapter AINDA não expõe `buscarLote`.

  async testarConexao(): Promise<ResultadoTesteConexao> {
    // Nunca finge conexão: sem cliente Linx real, nada é chamado.
    return { ok: false, mensagem: 'NÃO TESTADO — aguardando credencial e o cliente Linx (próxima etapa).' };
  }
}
