import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { assinarToken } from '../middlewares/auth';
import { criarFixtureEmpresa } from '../gamificacao/test-helpers';
import { criarPlaybookDraft, publicarPlaybook } from '../treinador/playbook.service';

async function tokenPara(vendedor: { id: string; empresaId: string; lojaId: string }) {
  return assinarToken({ vendedorId: vendedor.id, empresaId: vendedor.empresaId, lojaId: vendedor.lojaId, papel: 'VENDEDOR' });
}

describe('GET /playbook/active', () => {
  it('rejeita sem token', async () => {
    const res = await request(app).get('/playbook/active');
    expect(res.status).toBe(401);
  });

  it('retorna null quando a empresa não tem playbook publicado', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const token = await tokenPara(vendedor);

    const res = await request(app).get('/playbook/active').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it('retorna o playbook publicado da própria empresa', async () => {
    const { vendedor, empresa } = await criarFixtureEmpresa();
    const draft = await criarPlaybookDraft(empresa.id, 'Playbook Teste', [
      { categoria: 'ABORDAGEM', titulo: 'Recepção', conteudo: 'Receba com sorriso.', origem: 'OFICIAL' },
    ]);
    await publicarPlaybook(draft.id, empresa.id, 'tester');
    const token = await tokenPara(vendedor);

    const res = await request(app).get('/playbook/active').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(draft.id);
    expect(res.body.secoes).toHaveLength(1);
  });

  it('nunca retorna o playbook de outra empresa (tenant isolation, seção 31)', async () => {
    const { vendedor: vendedorA } = await criarFixtureEmpresa();
    const { empresa: empresaB } = await criarFixtureEmpresa();
    const draftB = await criarPlaybookDraft(empresaB.id, 'Playbook B', [
      { categoria: 'ABORDAGEM', titulo: 'Segredo da empresa B', conteudo: 'confidencial', origem: 'OFICIAL' },
    ]);
    await publicarPlaybook(draftB.id, empresaB.id, 'tester');
    const tokenA = await tokenPara(vendedorA);

    const res = await request(app).get('/playbook/active').set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });
});
