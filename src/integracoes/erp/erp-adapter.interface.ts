export interface IndicadorErp {
  matriculaErp: string;
  faturamento: number;
  ticketMedio: number;
  pa: number;
  numAtendimentos: number;
}

export interface ErpAdapter {
  /**
   * Busca os indicadores de todos os vendedores de uma loja, na hora de referência.
   */
  buscarIndicadoresPorLoja(codigoErpLoja: string, dataHora: Date): Promise<IndicadorErp[]>;
}
