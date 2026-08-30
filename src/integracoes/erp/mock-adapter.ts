import { ErpAdapter, IndicadorErp } from './erp-adapter.interface';
import { prisma } from '../../db';

/**
 * Adapter de desenvolvimento: gera indicadores plausíveis para os vendedores
 * já cadastrados no banco, sem depender de credenciais reais do Linx.
 * Usado quando ERP_MODE=mock (padrão em dev/local).
 */
export class MockErpAdapter implements ErpAdapter {
  async buscarIndicadoresPorLoja(codigoErpLoja: string, _dataHora: Date): Promise<IndicadorErp[]> {
    const loja = await prisma.loja.findFirst({ where: { codigoErp: codigoErpLoja } });
    if (!loja) return [];

    const vendedores = await prisma.vendedor.findMany({ where: { lojaId: loja.id, status: 'ACTIVE' } });

    return vendedores.map((v) => {
      const numAtendimentos = 2 + Math.floor(Math.random() * 8);
      const ticketMedio = 80 + Math.random() * 120;
      const pa = 1 + Math.random() * 2;
      return {
        matriculaErp: v.matriculaErp,
        numAtendimentos,
        ticketMedio: Number(ticketMedio.toFixed(2)),
        pa: Number(pa.toFixed(2)),
        faturamento: Number((ticketMedio * numAtendimentos).toFixed(2)),
      };
    });
  }
}
