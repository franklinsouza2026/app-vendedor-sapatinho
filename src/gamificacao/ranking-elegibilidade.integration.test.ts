// Elegibilidade do ranking comercial (Fatia 9.7, P0). ADMIN e GERENTE também
// são linhas de `Vendedor` (papel é atributo, não tabela separada) e entravam
// no ranking de vendas junto com quem de fato vende.
//
// A regra é aplicada no BACKEND: o snapshot persistido não deve nem conter
// quem não é elegível — esconder só na tela deixaria o vazamento no dado.
import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../db';
import { criarFixtureEmpresa } from './test-helpers';
import { recalcularTodosOsRankingsDoDia, getRanking } from './ranking.service';

async function criarPessoa(empresaId: string, lojaId: string, papel: 'VENDEDOR' | 'GERENTE' | 'ADMIN', nome: string) {
  return prisma.vendedor.create({
    data: {
      empresaId,
      lojaId,
      matriculaErp: `${papel}-${randomUUID()}`,
      nome,
      papel,
      status: 'ACTIVE',
      senhaHash: 'hash-nao-usado',
    },
  });
}

describe('Ranking comercial — só participa quem é VENDEDOR', () => {
  it('ADMIN e GERENTE nunca entram no snapshot de ranking, nem com faturamento lançado', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const gerente = await criarPessoa(empresa.id, loja.id, 'GERENTE', 'Gerente Teste');
    const admin = await criarPessoa(empresa.id, loja.id, 'ADMIN', 'Admin Teste');

    // Todos os três com indicador do dia — inclusive os dois que não vendem.
    const agora = new Date();
    agora.setMinutes(0, 0, 0);
    for (const pessoa of [vendedor, gerente, admin]) {
      await prisma.indicadorRealizado.create({
        data: {
          empresaId: empresa.id,
          lojaId: loja.id,
          vendedorId: pessoa.id,
          dataHora: agora,
          faturamento: 5000,
          ticketMedio: 250,
          pa: 2,
          numAtendimentos: 20,
          fonteJobId: 'teste',
        },
      });
    }

    await recalcularTodosOsRankingsDoDia(empresa.id);

    const snapshot = await prisma.rankingSnapshot.findMany({
      where: { empresaId: empresa.id, tipo: 'FATURAMENTO', escopo: 'LOJA', lojaId: loja.id },
    });
    const idsNoSnapshot = snapshot.map((s) => s.vendedorId);

    expect(idsNoSnapshot).toContain(vendedor.id);
    expect(idsNoSnapshot).not.toContain(gerente.id);
    expect(idsNoSnapshot).not.toContain(admin.id);
  });

  it('a leitura do ranking também não devolve Admin/Gerente (vale pra LOJA e pra REDE)', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const gerente = await criarPessoa(empresa.id, loja.id, 'GERENTE', 'Gerente Teste');

    await recalcularTodosOsRankingsDoDia(empresa.id);

    for (const escopo of ['LOJA', 'REDE'] as const) {
      const linhas = await getRanking(empresa.id, escopo, escopo === 'LOJA' ? loja.id : null, 'SCORE_GERAL', 'DIA', vendedor.id);
      expect(linhas.some((l) => l.vendedorId === gerente.id)).toBe(false);
      expect(linhas.some((l) => l.vendedorId === vendedor.id)).toBe(true);
    }
  });

  it('vendedor desligado continua fora, e vendedor ativo continua dentro (não quebrou o filtro de status)', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const desligado = await criarPessoa(empresa.id, loja.id, 'VENDEDOR', 'Desligado');
    await prisma.vendedor.update({ where: { id: desligado.id }, data: { status: 'OFFBOARDED' } });

    await recalcularTodosOsRankingsDoDia(empresa.id);

    const snapshot = await prisma.rankingSnapshot.findMany({
      where: { empresaId: empresa.id, tipo: 'SCORE_GERAL', escopo: 'LOJA', lojaId: loja.id },
    });
    const ids = snapshot.map((s) => s.vendedorId);
    expect(ids).toContain(vendedor.id);
    expect(ids).not.toContain(desligado.id);
  });
});
