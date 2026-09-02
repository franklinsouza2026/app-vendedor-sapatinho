// OneOnOne — ciclo de vida + privacidade (Fatia 9, seção 24-30/104/108).
// Notas são privadas do gerente; escopo por loja (anti-IDOR entre lojas).
import { describe, expect, it } from 'vitest';
import { prisma } from '../db';
import { criarFixtureEmpresa } from '../gamificacao/test-helpers';
import { criarOneOnOne, iniciarOneOnOne, concluirOneOnOne, cancelarOneOnOne, buscarOneOnOneNoEscopo, listarOneOnOnesDoVendedor, ROTEIRO_SUGERIDO_1A1 } from './one-on-one.service';

describe('Ciclo de vida do 1:1', () => {
  it('SCHEDULED -> IN_PROGRESS -> COMPLETED com notas sanitizadas', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const gerente = await prisma.vendedor.create({ data: { empresaId: empresa.id, lojaId: loja.id, matriculaErp: 'GER-TESTE', nome: 'Gerente Teste', papel: 'GERENTE' } });

    const encontro = await criarOneOnOne({ empresaId: empresa.id, lojaId: loja.id, managerId: gerente.id, sellerId: vendedor.id });
    expect(encontro.status).toBe('SCHEDULED');

    await iniciarOneOnOne(empresa.id, loja.id, encontro.id);
    let atual = await buscarOneOnOneNoEscopo(empresa.id, loja.id, encontro.id);
    expect(atual.status).toBe('IN_PROGRESS');

    await concluirOneOnOne(empresa.id, loja.id, encontro.id, { pontosPositivos: '<script>x</script>Boa postura com clientes', compromissos: 'Focar em PA' }, gerente.id);
    atual = await buscarOneOnOneNoEscopo(empresa.id, loja.id, encontro.id);
    expect(atual.status).toBe('COMPLETED');
    expect(atual.pontosPositivos).not.toContain('<script>');
    expect(atual.completedAt).not.toBeNull();
  });

  it('nunca cria 1:1 com um vendedor de outra loja (anti-IDOR)', async () => {
    const { empresa, loja, vendedor: gerenteBase } = await criarFixtureEmpresa();
    const outraFixture = await criarFixtureEmpresa();
    await expect(criarOneOnOne({ empresaId: empresa.id, lojaId: loja.id, managerId: gerenteBase.id, sellerId: outraFixture.vendedor.id })).rejects.toMatchObject({ type: 'not_found' });
  });

  it('1:1 de uma loja nunca é acessível a partir do escopo de outra loja (privacidade, seção 27/85)', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const gerente = await prisma.vendedor.create({ data: { empresaId: empresa.id, lojaId: loja.id, matriculaErp: 'GER-TESTE-2', nome: 'Gerente', papel: 'GERENTE' } });
    const encontro = await criarOneOnOne({ empresaId: empresa.id, lojaId: loja.id, managerId: gerente.id, sellerId: vendedor.id });

    const outraFixture = await criarFixtureEmpresa();
    await expect(buscarOneOnOneNoEscopo(outraFixture.empresa.id, outraFixture.loja.id, encontro.id)).rejects.toMatchObject({ type: 'not_found' });
  });

  it('histórico é preservado ao cancelar (nunca apaga)', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const gerente = await prisma.vendedor.create({ data: { empresaId: empresa.id, lojaId: loja.id, matriculaErp: 'GER-TESTE-3', nome: 'Gerente', papel: 'GERENTE' } });
    const encontro = await criarOneOnOne({ empresaId: empresa.id, lojaId: loja.id, managerId: gerente.id, sellerId: vendedor.id });
    await cancelarOneOnOne(empresa.id, loja.id, encontro.id, gerente.id);

    const historico = await listarOneOnOnesDoVendedor(empresa.id, loja.id, vendedor.id);
    expect(historico).toHaveLength(1);
    expect(historico[0].status).toBe('CANCELLED');
  });

  it('roteiro sugerido é estático (nunca gerado por IA) e tem 7 perguntas', () => {
    expect(ROTEIRO_SUGERIDO_1A1).toHaveLength(7);
  });
});
