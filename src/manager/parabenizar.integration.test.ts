// "Parabenizar" (Fatia 9.6, seção 39-41) — nunca texto livre do gerente,
// nunca um destaque inventado; reaproveita Recognition/FeedEvent (Fatia 8).
import { describe, expect, it } from 'vitest';
import { prisma } from '../db';
import { criarFixtureEmpresa, criarIndicador } from '../gamificacao/test-helpers';
import { parabenizarSinalPositivo } from './positive-signals.service';
import { ManagerError } from './constantes';

describe('parabenizarSinalPositivo', () => {
  it('cria um Recognition real quando o destaque é real (streak)', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const gerente = await prisma.vendedor.create({ data: { empresaId: empresa.id, lojaId: loja.id, matriculaErp: 'GER-PARABENS', nome: 'Gerente', senhaHash: 'x', papel: 'GERENTE' } });
    await prisma.streakVendedor.create({ data: { empresaId: empresa.id, lojaId: loja.id, vendedorId: vendedor.id, streakAtual: 5, maiorStreak: 5 } });

    const reconhecimento = await parabenizarSinalPositivo(empresa.id, loja.id, gerente.id, vendedor.id, 'STREAK');
    expect(reconhecimento.subjectId).toBe(vendedor.id);
    expect(reconhecimento.authorId).toBe(gerente.id);
    expect(reconhecimento.tipo).toBe('CONSISTENCY');

    const salvo = await prisma.recognition.findUniqueOrThrow({ where: { id: reconhecimento.id } });
    expect(salvo.message).toContain('dias seguidos');
  });

  it('nunca cria Recognition pra um destaque inventado (tipo real mas sem evidência real agora)', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const gerente = await prisma.vendedor.create({ data: { empresaId: empresa.id, lojaId: loja.id, matriculaErp: 'GER-PARABENS-2', nome: 'Gerente', senhaHash: 'x', papel: 'GERENTE' } });
    // Nenhum streak, nenhum indicador — nenhum sinal positivo real existe agora.

    await expect(parabenizarSinalPositivo(empresa.id, loja.id, gerente.id, vendedor.id, 'STREAK')).rejects.toMatchObject({ type: 'not_found' });
    const contagem = await prisma.recognition.count({ where: { subjectId: vendedor.id } });
    expect(contagem).toBe(0);
  });

  it('nunca parabeniza vendedor de outra loja (anti-IDOR)', async () => {
    const { empresa, loja } = await criarFixtureEmpresa();
    const outraFixture = await criarFixtureEmpresa();
    const gerente = await prisma.vendedor.create({ data: { empresaId: empresa.id, lojaId: loja.id, matriculaErp: 'GER-PARABENS-3', nome: 'Gerente', senhaHash: 'x', papel: 'GERENTE' } });

    await expect(parabenizarSinalPositivo(empresa.id, loja.id, gerente.id, outraFixture.vendedor.id, 'STREAK')).rejects.toMatchObject({ type: 'not_found' });
  });

  it('mensagem é sempre gerada pelo backend (descrição do sinal), nunca aceita texto do gerente', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const gerente = await prisma.vendedor.create({ data: { empresaId: empresa.id, lojaId: loja.id, matriculaErp: 'GER-PARABENS-4', nome: 'Gerente', senhaHash: 'x', papel: 'GERENTE' } });
    await criarIndicador(vendedor.id, new Date(), { faturamento: 500 });
    const meta = await prisma.meta.create({ data: { empresaId: empresa.id, lojaId: loja.id, vendedorId: vendedor.id, tipo: 'FATURAMENTO', periodo: 'DIA', referencia: new Date(new Date().setHours(0, 0, 0, 0)), valorMeta: 100 } });
    void meta;

    // GOAL_REACHED vem do Feed (evento real), não é fabricado aqui — sem
    // evento no Feed, mesmo com meta batida, o "destaque" não existe ainda.
    await expect(parabenizarSinalPositivo(empresa.id, loja.id, gerente.id, vendedor.id, 'GOAL_REACHED')).rejects.toMatchObject({ type: 'not_found' } satisfies Partial<ManagerError>);
  });
});
