// Linx L2 — Central de Integrações e Saúde ANTES da chave: honestidade.
// Linx sem credencial nunca aparece verde; "testar conexão" nunca finge
// sucesso; portal é configuração validada (não segredo); cursor é exposto
// como texto (sem perder precisão). Nenhuma chamada à Linx real.
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../app';
import { prisma } from '../../db';
import { tokenPara } from '../../gamificacao/test-helpers';
import { criarCenarioFase1, criarVendedorExtra } from '../test-helpers';

async function adminComLinx() {
  const c = await criarCenarioFase1();
  const admin = await criarVendedorExtra(c.empresa.id, c.loja.id, 'Admin Linx');
  const token = await tokenPara({ vendedorId: admin.id, empresaId: c.empresa.id, lojaId: c.loja.id, papel: 'ADMIN' });
  const api = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const criada = await api(request(app).post('/admin/fase1/integracoes').send({ provedor: 'LINX', configuracao: {} }));
  expect(criada.status).toBe(201);
  return { ...c, api, linx: criada.body as { id: string } };
}

describe('Central de Integrações — Linx antes da chave', () => {
  it('Saúde: Linx sem credencial = ATENÇÃO "não configurada / não testada" (nunca operacional)', async () => {
    const c = await adminComLinx();
    const s = (await c.api(request(app).get('/admin/fase1/saude'))).body;
    const linx = s.integracoes.find((i: { provedor: string }) => i.provedor === 'LINX');
    expect(linx.estado).toBe('ATENCAO');
    expect(linx.naoConfigurada).toBe(true);
    expect(linx.motivo).toMatch(/aguardando credencial/i);
    expect(linx.motivo).toMatch(/não testada/i);
    expect(linx.cursores).toEqual([]);
  });

  it('testar conexão Linx não finge sucesso', async () => {
    const c = await adminComLinx();
    const r = await c.api(request(app).post(`/admin/fase1/integracoes/${c.linx.id}/testar`));
    expect(r.body.ok).toBe(false);
    expect(r.body.mensagem).toMatch(/NÃO TESTADO/);
  });

  it('portal (IdPortal) é configuração validada: número positivo; texto/negativo/campo desconhecido são recusados', async () => {
    const c = await adminComLinx();
    const ok = await c.api(request(app).patch(`/admin/fase1/integracoes/${c.linx.id}`).send({ configuracao: { portal: 12345, backfillDesde: '2026-09-01' } }));
    expect(ok.status).toBe(200);
    expect(ok.body.configuracao).toEqual({ portal: 12345, backfillDesde: '2026-09-01' });
    for (const ruim of [{ portal: '12345' }, { portal: -1 }, { portal: 1.5 }, { chave: 'nao-pode-aqui' }, { backfillDesde: '01/09/2026' }]) {
      expect((await c.api(request(app).patch(`/admin/fase1/integracoes/${c.linx.id}`).send({ configuracao: ruim }))).status).toBe(400);
    }
  });

  it('Saúde expõe o cursor como texto exato (acima de 2^53) e as contagens da execução', async () => {
    const c = await adminComLinx();
    await prisma.integracaoCursor.create({ data: { empresaId: c.empresa.id, integracaoId: c.linx.id, metodo: 'LinxMovimento', escopo: '11111111000101', valor: 9223372036854775806n, fase: 'LIVE', ultimoAvancoEm: new Date() } });
    const s = (await c.api(request(app).get('/admin/fase1/saude'))).body;
    const linx = s.integracoes.find((i: { provedor: string }) => i.provedor === 'LINX');
    expect(linx.cursores).toEqual([expect.objectContaining({ metodo: 'LinxMovimento', escopo: '11111111000101', fase: 'LIVE', valor: '9223372036854775806' })]);
    expect(linx.minutosDesdeUltimoAvanco).toBe(0);
  });
});
