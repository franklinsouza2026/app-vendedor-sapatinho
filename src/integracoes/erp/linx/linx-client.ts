import { ErpAdapter, IndicadorErp } from '../erp-adapter.interface';
import { env } from '../../../config';

/**
 * Adapter real do ERP Linx — pendente de validação com credenciais/documentação
 * de API reais (ver risco registrado em 02-Arquitetura-Proposta.md do vault:
 * "API do Linx pode não ter endpoint por vendedor/hora granular o suficiente").
 *
 * O formato exato do endpoint/payload precisa ser confirmado contra o ambiente
 * real da Sapatinho de Luxo antes de considerar esta implementação pronta —
 * o mapeamento abaixo é um ponto de partida, não uma integração testada.
 */
export class LinxErpAdapter implements ErpAdapter {
  async buscarIndicadoresPorLoja(codigoErpLoja: string, dataHora: Date): Promise<IndicadorErp[]> {
    const url = new URL(`${env.LINX_API_URL}/lojas/${codigoErpLoja}/indicadores-vendedor`);
    url.searchParams.set('dataHora', dataHora.toISOString());

    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${env.LINX_API_KEY}`,
        Accept: 'application/json',
      },
    });

    if (!resp.ok) {
      throw new Error(`Linx respondeu ${resp.status} ao buscar indicadores da loja ${codigoErpLoja}`);
    }

    const data = (await resp.json()) as unknown[];

    // TODO: mapear campos reais do payload Linx assim que o contrato for confirmado
    return this.mapear(data);
  }

  private mapear(data: unknown[]): IndicadorErp[] {
    return data.map((item) => {
      const raw = item as Record<string, unknown>;
      return {
        matriculaErp: String(raw.matricula ?? ''),
        faturamento: Number(raw.faturamento ?? 0),
        ticketMedio: Number(raw.ticket_medio ?? 0),
        pa: Number(raw.pa ?? 0),
        numAtendimentos: Number(raw.num_atendimentos ?? 0),
      };
    });
  }
}
