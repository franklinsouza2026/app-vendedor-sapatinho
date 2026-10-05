// D12 — PA = PEÇAS POR ATENDIMENTO. Venda entra pelo contrato do ERP, o
// agregado e o painel recalculam a partir dos fatos (cancelamento/devolução
// compensam, nada é apagado).
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { app } from '../../app';
import { prisma } from '../../db';
import { env } from '../../config';
import { tokenPara } from '../../gamificacao/test-helpers';
import { diaLocal } from '../../tempo/dia';
import { EventoErp } from '../../integracoes/erp';
import { sincronizarIntegracao } from '../integracoes/sync.service';
import { cancelamento, criarCenarioFase1, devolucao, item, venda } from '../test-helpers';
import { calcularPa, pecasDoItem } from './pa';

const mes = () => diaLocal(new Date(), 'America/Sao_Paulo').slice(0, 7);
const agoraMenos = () => new Date(Date.now() - 60_000).toISOString();
const calcado = (valor: number, quantidade = 1) => item(valor, { referencia: 'SCARPIN-1', descricao: 'Scarpin', categoria: 'Salto', quantidade, pares: quantidade });
const bolsa = (valor: number) => item(valor, { referencia: 'BOLSA-1', descricao: 'Bolsa tiracolo', categoria: 'Bolsa', quantidade: 1, pares: 0 });

function depositar(integracaoId: string, eventos: EventoErp[]) {
  const pasta = join(env.ERP_CONTROLADO_DIR!, integracaoId);
  mkdirSync(pasta, { recursive: true });
  writeFileSync(join(pasta, `${Date.now()}-${randomUUID()}.json`), JSON.stringify(eventos));
}

async function cenario() {
  const c = await criarCenarioFase1({ mes: mes(), metaMensal: 30000, diasPrevistos: 30 });
  await prisma.vendedor.update({ where: { id: c.vendedor.id }, data: { status: 'ACTIVE' } });
  const token = await tokenPara({ vendedorId: c.vendedor.id, empresaId: c.empresa.id, lojaId: c.loja.id, papel: 'VENDEDOR' });
  const entregar = async (eventos: EventoErp[]) => {
    depositar(c.integracao.id, eventos);
    await sincronizarIntegracao(c.integracao.id);
  };
  const realizadoHoje = async () => (await request(app).get('/app/painel').set('Authorization', `Bearer ${token}`)).body.hoje.realizado;
  return { ...c, entregar, realizadoHoje };
}

beforeAll(() => rmSync(env.ERP_CONTROLADO_DIR!, { recursive: true, force: true }));

describe('D12 — regra pura', () => {
  it('peça = quantidade comercial efetiva; PA = peças ÷ atendimentos; sem atendimento → null', () => {
    expect(pecasDoItem({ quantidade: 1 })).toBe(1);
    expect(pecasDoItem({ quantidade: 2, quantidadeDevolvida: 1 })).toBe(1);
    expect(pecasDoItem({ quantidade: 1, quantidadeDevolvida: 3 })).toBe(0);
    expect(calcularPa(3, 1)).toBe(3);
    expect(calcularPa(4, 2)).toBe(2);
    expect(calcularPa(5, 3)).toBe(1.67);
    expect(calcularPa(0, 0)).toBeNull();
  });
});

describe('D12 — PA pelo fluxo real (ERP → ingestão → agregado → painel)', () => {
  it('1 calçado = 1 peça; 1 bolsa = 1 peça; 2 calçados + 1 bolsa = 3 peças (PA 3,00 num atendimento)', async () => {
    const c = await cenario();
    await c.entregar([venda(c.loja.codigoErp, c.vendedor.matriculaErp, agoraMenos(), [calcado(200), calcado(180), bolsa(150)])]);
    const r = await c.realizadoHoje();
    expect(r.vendas).toBe(1);
    expect(r.pecas).toBe(3);
    expect(r.pares).toBe(2); // pares físicos seguem disponíveis, mas não entram no PA
    expect(r.pa).toBe(3);
  });

  it('PA consolidado: venda A (2 calçados + 1 bolsa) + venda B (1 bolsa) = 4 peças / 2 atendimentos = 2,00', async () => {
    const c = await cenario();
    await c.entregar([
      venda(c.loja.codigoErp, c.vendedor.matriculaErp, agoraMenos(), [calcado(200), calcado(180), bolsa(150)]),
      venda(c.loja.codigoErp, c.vendedor.matriculaErp, agoraMenos(), [bolsa(150)]),
    ]);
    const r = await c.realizadoHoje();
    expect(r.pecas).toBe(4);
    expect(r.vendas).toBe(2);
    expect(r.pa).toBe(2);
  });

  it('item com quantidade 2 conta 2 peças (kit/multiunidade entra como a fonte registrar)', async () => {
    const c = await cenario();
    await c.entregar([venda(c.loja.codigoErp, c.vendedor.matriculaErp, agoraMenos(), [calcado(300, 2)])]);
    const r = await c.realizadoHoje();
    expect(r.pecas).toBe(2);
    expect(r.pa).toBe(2);
  });

  it('cancelamento recalcula: a venda cancelada sai de peças, atendimentos e PA (histórico preservado)', async () => {
    const c = await cenario();
    const a = venda(c.loja.codigoErp, c.vendedor.matriculaErp, agoraMenos(), [calcado(200), calcado(180), bolsa(150)]);
    const b = venda(c.loja.codigoErp, c.vendedor.matriculaErp, agoraMenos(), [bolsa(150)]);
    await c.entregar([a, b]);
    expect((await c.realizadoHoje()).pa).toBe(2);
    await c.entregar([cancelamento(a.idExterno, agoraMenos())]);
    const r = await c.realizadoHoje();
    expect(r.vendas).toBe(1);
    expect(r.pecas).toBe(1);
    expect(r.pa).toBe(1);
    expect(r.faturamento).toBe(150);
    expect(await prisma.venda.count({ where: { empresaId: c.empresa.id } })).toBe(2); // nada apagado
  });

  it('devolução parcial recalcula: 3 peças, devolve a bolsa → 2 peças, PA 2,00; repetir a devolução não desconta de novo', async () => {
    const c = await cenario();
    const a = venda(c.loja.codigoErp, c.vendedor.matriculaErp, agoraMenos(), [calcado(200), calcado(180), bolsa(150)]);
    await c.entregar([a]);
    const d = devolucao(a.idExterno, agoraMenos(), [bolsa(150)]);
    await c.entregar([d]);
    await c.entregar([d]);
    const r = await c.realizadoHoje();
    expect(r.vendas).toBe(1);
    expect(r.pecas).toBe(2);
    expect(r.pa).toBe(2);
    expect(r.faturamento).toBe(380);
  });
});
