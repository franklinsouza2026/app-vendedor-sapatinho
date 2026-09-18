// Mock ERP (Fatia 9.7, P1). Dois defeitos reais corrigidos: o acumulado do dia
// oscilava (Math.random por chamada) e ADMIN/GERENTE recebiam venda fake.
import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../db';
import { criarFixtureEmpresa } from '../../gamificacao/test-helpers';
import { MockErpAdapter } from './mock-adapter';

const adapter = new MockErpAdapter();

async function criarPessoa(empresaId: string, lojaId: string, papel: 'VENDEDOR' | 'GERENTE' | 'ADMIN') {
  return prisma.vendedor.create({
    data: {
      empresaId,
      lojaId,
      matriculaErp: `${papel}-${randomUUID()}`,
      nome: `${papel} Teste`,
      papel,
      status: 'ACTIVE',
      senhaHash: 'hash-nao-usado',
    },
  });
}

/** Hora local de um dia fixo — o adapter trabalha em dia/hora LOCAL, igual ao resto do produto. */
function emHora(hora: number, dia = 17): Date {
  const d = new Date(2026, 8, dia); // mês 8 = setembro (local, não UTC)
  d.setHours(hora, 0, 0, 0);
  return d;
}

describe('MockErpAdapter', () => {
  it('SELLER-ONLY: nunca gera venda para ADMIN nem para GERENTE', async () => {
    const { loja, vendedor } = await criarFixtureEmpresa();
    const gerente = await criarPessoa(vendedor.empresaId, loja.id, 'GERENTE');
    const admin = await criarPessoa(vendedor.empresaId, loja.id, 'ADMIN');

    const indicadores = await adapter.buscarIndicadoresPorLoja(loja.codigoErp, emHora(12));
    const matriculas = indicadores.map((i) => i.matriculaErp);

    expect(matriculas).toContain(vendedor.matriculaErp);
    expect(matriculas).not.toContain(gerente.matriculaErp);
    expect(matriculas).not.toContain(admin.matriculaErp);
  });

  it('DETERMINÍSTICO: duas chamadas na mesma hora devolvem exatamente o mesmo valor', async () => {
    const { loja } = await criarFixtureEmpresa();

    const primeira = await adapter.buscarIndicadoresPorLoja(loja.codigoErp, emHora(10));
    const segunda = await adapter.buscarIndicadoresPorLoja(loja.codigoErp, emHora(10));

    expect(segunda).toEqual(primeira);
  });

  it('MONOTÔNICO: o acumulado do dia nunca cai ao longo das 24 horas', async () => {
    const { loja, vendedor } = await criarFixtureEmpresa();

    let anterior = 0;
    let anteriorAtendimentos = 0;
    // Todas as 24 horas, não uma amostra — a versão anterior deste mock trocava
    // a semente no meio do dia por usar dia UTC com hora local, e uma amostra
    // esparsa podia não pegar exatamente a hora da virada.
    for (let hora = 0; hora < 24; hora++) {
      const indicadores = await adapter.buscarIndicadoresPorLoja(loja.codigoErp, emHora(hora));
      const meu = indicadores.find((i) => i.matriculaErp === vendedor.matriculaErp)!;

      expect(meu.faturamento).toBeGreaterThanOrEqual(anterior);
      expect(meu.numAtendimentos).toBeGreaterThanOrEqual(anteriorAtendimentos);
      anterior = meu.faturamento;
      anteriorAtendimentos = meu.numAtendimentos;
    }

    // E de fato cresceu ao longo do dia (não é uma constante trivialmente monotônica).
    expect(anterior).toBeGreaterThan(0);
  });

  it('ticket e PA são estáveis ao longo do dia (são médias, não acumulam)', async () => {
    const { loja, vendedor } = await criarFixtureEmpresa();

    const manha = (await adapter.buscarIndicadoresPorLoja(loja.codigoErp, emHora(9))).find((i) => i.matriculaErp === vendedor.matriculaErp)!;
    const noite = (await adapter.buscarIndicadoresPorLoja(loja.codigoErp, emHora(22))).find((i) => i.matriculaErp === vendedor.matriculaErp)!;

    expect(noite.ticketMedio).toBe(manha.ticketMedio);
    expect(noite.pa).toBe(manha.pa);
  });

  it('dias diferentes têm perfis diferentes (o mock não congela o mesmo número pra sempre)', async () => {
    const { loja, vendedor } = await criarFixtureEmpresa();

    const hoje = (await adapter.buscarIndicadoresPorLoja(loja.codigoErp, emHora(18, 17))).find((i) => i.matriculaErp === vendedor.matriculaErp)!;
    const amanha = (await adapter.buscarIndicadoresPorLoja(loja.codigoErp, emHora(18, 18))).find((i) => i.matriculaErp === vendedor.matriculaErp)!;

    expect(amanha.ticketMedio).not.toBe(hoje.ticketMedio);
  });

  it('loja inexistente devolve lista vazia, nunca erro', async () => {
    expect(await adapter.buscarIndicadoresPorLoja(`INEXISTENTE-${randomUUID()}`, emHora(12))).toEqual([]);
  });
});
