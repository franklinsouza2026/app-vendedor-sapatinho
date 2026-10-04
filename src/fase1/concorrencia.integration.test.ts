// Concorrência (Onda 8, §30): uma ocorrência lógica → UMA consequência,
// mesmo com sync, encerramento ou ajuste disparados ao mesmo tempo.
import { beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { prisma } from '../db';
import { env } from '../config';
import { getSaldoMoedas, getTotalXp } from '../gamificacao/ledger.service';
import { diaLocal } from '../tempo/dia';
import { EventoErp } from '../integracoes/erp';
import { sincronizarIntegracao } from './integracoes/sync.service';
import { criarCenarioFase1, criarVendedorExtra, item, venda } from './test-helpers';
import { criarProduto } from './incentivos/produtos.service';
import { criarPremio } from './incentivos/premios.service';
import { publicarMissao, salvarRascunho } from './missoes/missoes.service';
import { criarCompeticaoFase1, finalizarCompeticaoFase1 } from './competicoes/competicoes.service';
import { atualizarCampanhasPeloRelogio, encerrarCampanha, publicarCampanha, salvarCampanha } from './campanhas/campanhas.service';
import { lancarAjuste } from './admin/gestao.service';

const mes = () => diaLocal(new Date(), 'America/Sao_Paulo').slice(0, 7);
const emHoras = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

function depositar(integracaoId: string, eventos: EventoErp[]) {
  const pasta = join(env.ERP_CONTROLADO_DIR!, integracaoId);
  mkdirSync(pasta, { recursive: true });
  writeFileSync(join(pasta, `${Date.now()}-${randomUUID()}.json`), JSON.stringify(eventos));
}

beforeAll(() => rmSync(env.ERP_CONTROLADO_DIR!, { recursive: true, force: true }));

describe('§30 — concorrência', () => {
  it('6 syncs simultâneos da mesma integração: 1 venda, meta paga 1 vez, missão concluída paga 1 vez', async () => {
    const c = await criarCenarioFase1({ mes: mes(), metaMensal: 3000, diasPrevistos: 30 }); // meta do dia R$ 100
    await prisma.vendedor.update({ where: { id: c.vendedor.id }, data: { status: 'ACTIVE' } });
    await criarProduto(c.empresa.id, c.vendedor.id, { referencia: 'REF-CONC', nome: 'Produto concorrência', categoria: 'Salto', preco: 150 });
    const m = await salvarRascunho(c.empresa.id, c.vendedor.id, { nome: 'Uma peça', tipo: 'PRODUTO_SEMANA', template: 'PRODUTO_SEMANA', descricao: 'Venda 1 par', unidade: 'par', alvo: 1, xp: 40, moedas: 15, premioId: null, lojas: 'TODAS', inicio: emHoras(-1), fim: emHoras(48), produtos: ['REF-CONC'], regras: 'Conta par.', parametros: {} });
    await publicarMissao(c.empresa.id, c.vendedor.id, m.id);

    depositar(c.integracao.id, [venda(c.loja.codigoErp, c.vendedor.matriculaErp, new Date(Date.now() - 60_000).toISOString(), [item(105, { referencia: 'REF-CONC' })])]);
    await Promise.all(Array.from({ length: 6 }, () => sincronizarIntegracao(c.integracao.id).catch(() => null)));
    await sincronizarIntegracao(c.integracao.id);

    expect(await prisma.venda.count({ where: { empresaId: c.empresa.id } })).toBe(1);
    const regua = { xp: 100, moedas: 50 }; // META_DIARIA_100 (régua v1)
    expect(await getTotalXp(c.vendedor.id)).toBe(regua.xp + 40);
    expect(await getSaldoMoedas(c.vendedor.id)).toBe(regua.moedas + 15);
  });

  it('competição encerrada 5 vezes ao mesmo tempo: prêmio do 1º lugar creditado 1 vez', async () => {
    const c = await criarCenarioFase1({ mes: mes(), metaMensal: 100000, diasPrevistos: 30 });
    await prisma.vendedor.update({ where: { id: c.vendedor.id }, data: { status: 'ACTIVE' } });
    const outro = await criarVendedorExtra(c.empresa.id, c.loja.id, 'Segunda');
    await prisma.vendedor.update({ where: { id: outro.id }, data: { status: 'ACTIVE', papel: 'VENDEDOR' } });
    const premio = await criarPremio(c.empresa.id, c.vendedor.id, { nome: 'Troféu', tipo: 'DIGITAL', xp: 77, moedas: 0, comBadge: false, categoria: null, descricao: '' });
    const comp = await criarCompeticaoFase1(c.empresa.id, c.vendedor.id, { nome: 'Sprint', tipo: 'VENDEDOR', formato: 'ESPECIAL', metrica: 'QTD_VENDAS', categoria: null, escopo: 'TODAS', lojas: 'TODAS', regra: 'Mais vendas.', inicio: emHoras(-1), fim: emHoras(24), premioIds: [premio.id] });
    depositar(c.integracao.id, [1, 2, 3].map(() => venda(c.loja.codigoErp, c.vendedor.matriculaErp, new Date(Date.now() - 60_000).toISOString(), [item(10)])));
    await sincronizarIntegracao(c.integracao.id);
    const xpAntes = await getTotalXp(c.vendedor.id);

    await Promise.all(Array.from({ length: 5 }, () => finalizarCompeticaoFase1(comp.id).catch(() => null)));
    expect((await getTotalXp(c.vendedor.id)) - xpAntes).toBe(77);
    expect(await getTotalXp(outro.id)).toBe(0);
  });

  it('campanha encerrada pelo Admin e pelo relógio ao mesmo tempo: prêmio da frente creditado 1 vez', async () => {
    const c = await criarCenarioFase1({ mes: mes(), metaMensal: 100000, diasPrevistos: 30 });
    await prisma.vendedor.update({ where: { id: c.vendedor.id }, data: { status: 'ACTIVE' } });
    const premio = await criarPremio(c.empresa.id, c.vendedor.id, { nome: 'Bônus', tipo: 'DIGITAL', xp: 33, moedas: 0, comBadge: false, categoria: null, descricao: '' });
    const vale = await criarPremio(c.empresa.id, c.vendedor.id, { nome: 'Vale (informativo)', tipo: 'EMPRESARIAL', xp: 0, moedas: 0, comBadge: false, categoria: 'VALE', descricao: 'Entregue pela loja' });
    const comp = await criarCompeticaoFase1(c.empresa.id, c.vendedor.id, { nome: 'Base', tipo: 'VENDEDOR', formato: 'ESPECIAL', metrica: 'QTD_VENDAS', categoria: null, escopo: 'TODAS', lojas: 'TODAS', regra: 'Mais vendas.', inicio: emHoras(-1), fim: emHoras(24), premioIds: [vale.id] });
    const camp = await salvarCampanha(c.empresa.id, c.vendedor.id, { nome: 'Campanha', descricao: 'd', objetivo: 'o', inicio: emHoras(-1), fim: emHoras(24), lojas: 'TODAS', regras: 'r', frentes: [{ id: 'f1', icone: '🏆', titulo: 'Top', mecanismo: 'COMPETICAO', refId: comp.id, premioId: premio.id }] });
    await publicarCampanha(c.empresa.id, c.vendedor.id, camp.id);
    depositar(c.integracao.id, [venda(c.loja.codigoErp, c.vendedor.matriculaErp, new Date(Date.now() - 60_000).toISOString(), [item(10)])]);
    await sincronizarIntegracao(c.integracao.id);
    const xpAntes = await getTotalXp(c.vendedor.id);

    const depoisDoFim = new Date(Date.now() + 25 * 3600_000);
    await Promise.all([
      ...Array.from({ length: 3 }, () => encerrarCampanha(c.empresa.id, c.vendedor.id, camp.id).catch(() => null)),
      ...Array.from({ length: 3 }, () => atualizarCampanhasPeloRelogio(c.empresa.id, depoisDoFim).catch(() => null)),
    ]);
    expect((await getTotalXp(c.vendedor.id)) - xpAntes).toBe(33);
  });

  it('o mesmo ajuste do Admin enviado 5 vezes (mesma chave, ao mesmo tempo): 1 lançamento', async () => {
    const c = await criarCenarioFase1({ mes: mes() });
    const admin = await criarVendedorExtra(c.empresa.id, c.loja.id, 'Admin');
    const chave = randomUUID();
    await Promise.all(Array.from({ length: 5 }, () => lancarAjuste(c.empresa.id, admin.id, { vendedorId: c.vendedor.id, xp: 25, moedas: 5, motivo: 'Correção de venda lançada em duplicidade', chave }).catch(() => null)));
    expect(await getTotalXp(c.vendedor.id)).toBe(25);
    expect(await getSaldoMoedas(c.vendedor.id)).toBe(5);
  });
});
