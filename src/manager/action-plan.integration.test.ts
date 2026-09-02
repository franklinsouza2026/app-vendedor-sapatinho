// ManagerActionPlan — ciclo de vida + concorrência (Fatia 9, seção 19-23/
// 103/113). Backend-autoritativo: nunca aceita status/completed do cliente
// (isso é garantido pelo Zod da rota, não pelo service — mas o service
// também nunca deriva status de um campo livre).
import { describe, expect, it } from 'vitest';
import { prisma } from '../db';
import { criarFixtureEmpresa } from '../gamificacao/test-helpers';
import { criarPlanoDeAcao, ativarPlano, concluirItem, concluirPlano, cancelarPlano, buscarPlanoNoEscopo } from './action-plan.service';

describe('Ciclo de vida do plano de ação', () => {
  it('DRAFT -> ACTIVE -> item concluído -> plano concluído', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const plano = await criarPlanoDeAcao({
      empresaId: empresa.id,
      lojaId: loja.id,
      subjectType: 'SELLER',
      subjectId: vendedor.id,
      title: 'Reforçar abordagem',
      createdBy: vendedor.id,
      itens: [{ tipo: 'TALK', descricao: 'Conversar sobre PA' }],
    });
    expect(plano.status).toBe('DRAFT');

    await ativarPlano(empresa.id, loja.id, plano.id, vendedor.id);
    let atual = await buscarPlanoNoEscopo(empresa.id, loja.id, plano.id);
    expect(atual.status).toBe('ACTIVE');

    await concluirItem(empresa.id, loja.id, plano.id, plano.itens[0].id, vendedor.id);
    atual = await buscarPlanoNoEscopo(empresa.id, loja.id, plano.id);
    expect(atual.itens[0].status).toBe('COMPLETED');

    await concluirPlano(empresa.id, loja.id, plano.id, vendedor.id);
    atual = await buscarPlanoNoEscopo(empresa.id, loja.id, plano.id);
    expect(atual.status).toBe('COMPLETED');
    expect(atual.completedAt).not.toBeNull();
  });

  it('dupla conclusão concorrente do MESMO plano é idempotente (só 1 evento de auditoria)', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const plano = await criarPlanoDeAcao({ empresaId: empresa.id, lojaId: loja.id, subjectType: 'STORE', title: 'Foco da semana', createdBy: vendedor.id, itens: [] });
    await ativarPlano(empresa.id, loja.id, plano.id, vendedor.id);

    await Promise.all([concluirPlano(empresa.id, loja.id, plano.id, vendedor.id), concluirPlano(empresa.id, loja.id, plano.id, vendedor.id)]);

    const eventos = await prisma.auditEvent.findMany({ where: { empresaId: empresa.id, acao: 'ACTION_PLAN_COMPLETED' } });
    const paraEstePlano = eventos.filter((e) => (e.metadata as { planId?: string } | null)?.planId === plano.id);
    expect(paraEstePlano).toHaveLength(1);
  });

  it('nunca completa um item de um plano ainda em DRAFT', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const plano = await criarPlanoDeAcao({ empresaId: empresa.id, lojaId: loja.id, subjectType: 'STORE', title: 'X', createdBy: vendedor.id, itens: [{ tipo: 'OBSERVE', descricao: 'Observar atendimento' }] });
    await expect(concluirItem(empresa.id, loja.id, plano.id, plano.itens[0].id, vendedor.id)).rejects.toMatchObject({ type: 'invalid_transition' });
  });

  it('cancela um plano ativo (histórico preservado, nunca apagado)', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const plano = await criarPlanoDeAcao({ empresaId: empresa.id, lojaId: loja.id, subjectType: 'STORE', title: 'X', createdBy: vendedor.id, itens: [] });
    await ativarPlano(empresa.id, loja.id, plano.id, vendedor.id);
    await cancelarPlano(empresa.id, loja.id, plano.id, vendedor.id);

    const atual = await buscarPlanoNoEscopo(empresa.id, loja.id, plano.id);
    expect(atual.status).toBe('CANCELLED');
  });

  it('XSS: descrição do item é sanitizada antes de persistir (seção 92/114)', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const plano = await criarPlanoDeAcao({
      empresaId: empresa.id,
      lojaId: loja.id,
      subjectType: 'STORE',
      title: '<script>alert(1)</script>Foco',
      createdBy: vendedor.id,
      itens: [{ tipo: 'CUSTOM_TEXT', descricao: '<img src=x onerror=alert(1)>Falar sobre metas' }],
    });
    expect(plano.title).not.toContain('<script>');
    expect(plano.itens[0].descricao).not.toContain('<img');
  });

  it('plano SELLER com subjectId de outra loja é rejeitado (anti-IDOR, seção 89)', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const outraFixture = await criarFixtureEmpresa();

    await expect(
      criarPlanoDeAcao({ empresaId: empresa.id, lojaId: loja.id, subjectType: 'SELLER', subjectId: outraFixture.vendedor.id, title: 'X', createdBy: vendedor.id, itens: [] })
    ).rejects.toMatchObject({ type: 'not_found' });
  });
});
