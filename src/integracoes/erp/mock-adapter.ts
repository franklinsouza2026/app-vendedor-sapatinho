import { createHash } from 'node:crypto';
import { ErpAdapter, IndicadorErp } from './erp-adapter.interface';
import { prisma } from '../../db';

/**
 * Adapter de desenvolvimento: gera indicadores plausíveis para os vendedores
 * já cadastrados no banco, sem depender de credenciais reais do Linx.
 * Usado quando ERP_MODE=mock (padrão em dev/local).
 *
 * Fatia 9.7 — dois defeitos reais corrigidos (achados em auditoria):
 *
 * 1. ACUMULADO MONOTÔNICO. A versão anterior chamava `Math.random()` a cada
 *    invocação, então o "acumulado do dia" do vendedor SUBIA E DESCIA entre
 *    syncs. Isso violava a premissa que `metas.service.ts` documenta (cada
 *    snapshot é o acumulado do dia até aquela hora) e fazia o motor de
 *    gamificação conceder e reverter moeda o dia inteiro sem motivo real.
 *    Agora o valor é derivado deterministicamente de (vendedor, dia) e cresce
 *    com a hora — reproduzível em teste e coerente ao longo do dia.
 *
 * 2. SELLER-ONLY. `findMany` filtrava só por loja + ACTIVE, gerando venda
 *    fake para ADMIN e GERENTE, que então apareciam no ranking comercial.
 *
 * Continua sendo um mock: não simula devolução/cancelamento. Uma queda de
 * faturamento continua possível no produto (o motor sabe reverter), mas ela
 * deve vir de um cenário explícito, nunca de ruído aleatório.
 */
export class MockErpAdapter implements ErpAdapter {
  async buscarIndicadoresPorLoja(codigoErpLoja: string, dataHora: Date): Promise<IndicadorErp[]> {
    const loja = await prisma.loja.findFirst({ where: { codigoErp: codigoErpLoja } });
    if (!loja) return [];

    const vendedores = await prisma.vendedor.findMany({
      // Só quem de fato vende: ADMIN e GERENTE são linhas de Vendedor mas não
      // têm faturamento próprio (e não participam do ranking comercial).
      where: { lojaId: loja.id, status: 'ACTIVE', papel: 'VENDEDOR' },
    });

    return vendedores.map((v) => {
      // Semente estável por vendedor+dia: o mesmo vendedor tem o mesmo "perfil
      // de dia" em todas as horas daquele dia, e um perfil diferente amanhã.
      //
      // A chave do dia usa componentes LOCAIS de propósito. Com `toISOString()`
      // o dia virava em UTC enquanto `getHours()` abaixo lê hora local — num
      // fuso negativo (ex.: UTC-3) a semente trocava às 21h local, no meio do
      // expediente, e o acumulado do dia CAÍA: exatamente o defeito que este
      // adapter foi reescrito pra eliminar. Todo o resto do produto também
      // trabalha em dia local (ver `inicioDoDia` em metas.service.ts).
      const dia = chaveDoDiaLocal(dataHora);
      const semente = pseudoAleatorio(`${v.id}:${dia}`);

      // Fração do dia já decorrida (0 → 1), usada pra fazer o acumulado crescer
      // hora a hora. `+1` na hora pra que o primeiro sync do dia já tenha venda.
      const progressoDoDia = Math.min(1, (dataHora.getHours() + 1) / 24);

      const atendimentosNoDia = 4 + Math.floor(semente * 8); // 4..11 no dia inteiro
      const numAtendimentos = Math.max(1, Math.round(atendimentosNoDia * progressoDoDia));

      // Ticket e PA são médias — não acumulam, então variam só por vendedor/dia.
      const ticketMedio = Number((90 + pseudoAleatorio(`${v.id}:${dia}:ticket`) * 110).toFixed(2));
      const pa = Number((1.2 + pseudoAleatorio(`${v.id}:${dia}:pa`) * 1.8).toFixed(2));

      return {
        matriculaErp: v.matriculaErp,
        numAtendimentos,
        ticketMedio,
        pa,
        faturamento: Number((ticketMedio * numAtendimentos).toFixed(2)),
      };
    });
  }
}

/** YYYY-MM-DD em horário LOCAL — precisa casar com o `getHours()` usado acima. */
function chaveDoDiaLocal(data: Date): string {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

/** Hash estável → [0,1). Determinístico entre processos e execuções (ao contrário de Math.random). */
function pseudoAleatorio(chave: string): number {
  const hash = createHash('sha256').update(chave).digest();
  // 4 bytes bastam pra granularidade que o mock precisa.
  return hash.readUInt32BE(0) / 0xffffffff;
}
