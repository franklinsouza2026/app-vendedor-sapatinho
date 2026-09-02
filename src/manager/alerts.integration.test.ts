// ManagerAlert — persistência/ciclo de vida (Fatia 9, seção 12-14/100-101).
// Cobre idempotência de geração (dedupe) e transições atômicas concorrentes.
import { describe, expect, it } from 'vitest';
import { prisma } from '../db';
import { criarFixtureEmpresa, criarIndicador } from '../gamificacao/test-helpers';
import { sincronizarAlertasDaLoja, listarAlertas, reconhecerAlerta, resolverAlerta, dispensarAlerta } from './alerts.service';

async function forcarAlertaPABaseline(vendedorId: string) {
  await prisma.baselinePessoal.create({ data: { vendedorId, metrica: 'PA', valor: 3, amostras: 10, amostraMinima: 5 } });
  await criarIndicador(vendedorId, new Date(), { faturamento: 100, pa: 1, numAtendimentos: 5 });
}

describe('sincronizarAlertasDaLoja — idempotência (dedupe, seção 12)', () => {
  it('rodar 2x seguidas nunca duplica o mesmo alerta aberto', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    await forcarAlertaPABaseline(vendedor.id);

    await sincronizarAlertasDaLoja(empresa.id, loja.id);
    await sincronizarAlertasDaLoja(empresa.id, loja.id);

    const alertas = await prisma.managerAlert.findMany({ where: { empresaId: empresa.id, lojaId: loja.id, sellerId: vendedor.id, tipo: 'PA_BELOW_BASELINE' } });
    expect(alertas).toHaveLength(1);
  });

  it('2 chamadas concorrentes de sincronização também nunca duplicam (índice único parcial cobre a corrida)', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    await forcarAlertaPABaseline(vendedor.id);

    await Promise.all([sincronizarAlertasDaLoja(empresa.id, loja.id), sincronizarAlertasDaLoja(empresa.id, loja.id)]);

    const alertas = await prisma.managerAlert.findMany({ where: { empresaId: empresa.id, lojaId: loja.id, sellerId: vendedor.id, tipo: 'PA_BELOW_BASELINE' } });
    expect(alertas).toHaveLength(1);
  });
});

describe('Ciclo de vida do alerta — OPEN -> ACKNOWLEDGED -> RESOLVED', () => {
  it('transições válidas funcionam e ficam registradas em auditoria', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    await forcarAlertaPABaseline(vendedor.id);
    await sincronizarAlertasDaLoja(empresa.id, loja.id);
    const [alerta] = await listarAlertas(empresa.id, loja.id);

    await reconhecerAlerta(empresa.id, loja.id, alerta.id, vendedor.id);
    let atualizado = await prisma.managerAlert.findUniqueOrThrow({ where: { id: alerta.id } });
    expect(atualizado.status).toBe('ACKNOWLEDGED');

    await resolverAlerta(empresa.id, loja.id, alerta.id, 'RESOLVED_OPERATIONALLY', vendedor.id);
    atualizado = await prisma.managerAlert.findUniqueOrThrow({ where: { id: alerta.id } });
    expect(atualizado.status).toBe('RESOLVED');
    expect(atualizado.tipoResolucao).toBe('RESOLVED_OPERATIONALLY');

    const eventos = await prisma.auditEvent.findMany({ where: { empresaId: empresa.id, acao: { in: ['MANAGER_ALERT_ACKNOWLEDGED', 'MANAGER_ALERT_RESOLVED'] } } });
    expect(eventos).toHaveLength(2);
  });

  it('duplo reconhecimento concorrente do MESMO alerta é idempotente (nunca gera 2 eventos de auditoria)', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    await forcarAlertaPABaseline(vendedor.id);
    await sincronizarAlertasDaLoja(empresa.id, loja.id);
    const [alerta] = await listarAlertas(empresa.id, loja.id);

    await Promise.all([reconhecerAlerta(empresa.id, loja.id, alerta.id, vendedor.id), reconhecerAlerta(empresa.id, loja.id, alerta.id, vendedor.id)]);

    const todosEventos = await prisma.auditEvent.findMany({ where: { empresaId: empresa.id, acao: 'MANAGER_ALERT_ACKNOWLEDGED' } });
    const paraEsteAlerta = todosEventos.filter((e) => (e.metadata as { alertId?: string } | null)?.alertId === alerta.id);
    expect(paraEsteAlerta).toHaveLength(1);
  });

  it('dispensar um alerta preserva histórico (nunca some do banco)', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    await forcarAlertaPABaseline(vendedor.id);
    await sincronizarAlertasDaLoja(empresa.id, loja.id);
    const [alerta] = await listarAlertas(empresa.id, loja.id);

    await dispensarAlerta(empresa.id, loja.id, alerta.id, vendedor.id);
    const registro = await prisma.managerAlert.findUniqueOrThrow({ where: { id: alerta.id } });
    expect(registro.status).toBe('DISMISSED');

    // Depois de dispensado, uma nova sincronização pode abrir um NOVO
    // alerta (situação ainda real) sem jamais reescrever o antigo.
    await sincronizarAlertasDaLoja(empresa.id, loja.id);
    const todos = await prisma.managerAlert.findMany({ where: { empresaId: empresa.id, lojaId: loja.id, sellerId: vendedor.id, tipo: 'PA_BELOW_BASELINE' } });
    expect(todos.length).toBeGreaterThanOrEqual(1);
    expect(todos.some((a) => a.id === alerta.id && a.status === 'DISMISSED')).toBe(true);
  });

  it('alerta de outra loja nunca é acessível (escopo, anti-IDOR)', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const outraFixture = await criarFixtureEmpresa();
    await forcarAlertaPABaseline(vendedor.id);
    await sincronizarAlertasDaLoja(empresa.id, loja.id);
    const [alerta] = await listarAlertas(empresa.id, loja.id);

    await expect(reconhecerAlerta(outraFixture.empresa.id, outraFixture.loja.id, alerta.id, outraFixture.vendedor.id)).rejects.toMatchObject({ type: 'not_found' });
  });
});
