// Mock ERP (provedor MOCK, só desenvolvimento) — agora fala o CONTRATO DE
// EVENTOS da Fase 1. Garantias mantidas da Fatia 9.7: só VENDEDOR recebe
// venda, e o mock é determinístico (reprocessar = mesmos ids = idempotente).
import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../db';
import { criarCenarioFase1 } from '../../fase1/test-helpers';
import { eventoErpSchema } from './erp-adapter.interface';
import { eventosDoDia, MockErpAdapter } from './mock-adapter';

const adapter = new MockErpAdapter();
const DESDE = new Date('2026-09-17T03:00:00.000Z'); // 17/09 00:00 em Brasília
const ATE = new Date('2026-09-18T02:59:59.999Z'); // fim do dia local

async function consulta() {
  const c = await criarCenarioFase1();
  return { c, consulta: { integracaoId: c.integracao.id, empresaId: c.empresa.id, lojasExternas: [c.loja.codigoErp], desde: DESDE, ate: ATE, credencial: null, configuracao: {} } };
}

describe('MockErpAdapter (contrato de eventos)', () => {
  it('SELLER-ONLY: nunca gera venda para ADMIN nem para GERENTE', async () => {
    const { c, consulta: q } = await consulta();
    const gerente = await prisma.vendedor.create({ data: { empresaId: c.empresa.id, lojaId: c.loja.id, matriculaErp: `G-${randomUUID()}`, nome: 'G', papel: 'GERENTE', senhaHash: 'x' } });
    const admin = await prisma.vendedor.create({ data: { empresaId: c.empresa.id, lojaId: c.loja.id, matriculaErp: `A-${randomUUID()}`, nome: 'A', papel: 'ADMIN', senhaHash: 'x' } });
    const vendedores = new Set((await adapter.buscarEventos(q)).filter((e) => e.tipo === 'VENDA').map((e) => (e as { vendedorExterno: string }).vendedorExterno));
    expect(vendedores.has(c.vendedor.matriculaErp)).toBe(true);
    expect(vendedores.has(gerente.matriculaErp)).toBe(false);
    expect(vendedores.has(admin.matriculaErp)).toBe(false);
  });

  it('DETERMINÍSTICO: a mesma janela devolve exatamente os mesmos eventos (mesmos ids)', async () => {
    const { consulta: q } = await consulta();
    expect(await adapter.buscarEventos(q)).toEqual(await adapter.buscarEventos(q));
  });

  it('todo evento gerado respeita o contrato do ERP Adapter', async () => {
    const { consulta: q } = await consulta();
    const eventos = await adapter.buscarEventos(q);
    expect(eventos.length).toBeGreaterThan(0);
    for (const e of eventos) expect(eventoErpSchema.safeParse(e).success).toBe(true);
  });

  it('só devolve eventos dentro da janela pedida', async () => {
    const { consulta: q } = await consulta();
    for (const e of await adapter.buscarEventos(q)) {
      const t = Date.parse(e.ocorridoEm);
      expect(t).toBeGreaterThanOrEqual(DESDE.getTime());
      expect(t).toBeLessThanOrEqual(ATE.getTime());
    }
  });

  it('dias diferentes têm perfis diferentes; cancelamento sempre referencia uma venda do próprio lote', () => {
    const a = eventosDoDia('L1', 'V1', '2026-09-17', DESDE.getTime());
    const b = eventosDoDia('L1', 'V1', '2026-09-18', DESDE.getTime() + 86_400_000);
    expect(a).not.toEqual(b);
    const todos = [...a, ...b, ...eventosDoDia('L1', 'V2', '2026-09-17', DESDE.getTime())];
    const vendas = new Set(todos.filter((e) => e.tipo === 'VENDA').map((e) => e.idExterno));
    for (const e of todos) if (e.tipo === 'CANCELAMENTO') expect(vendas.has(e.vendaIdExterno)).toBe(true);
  });

  it('loja sem vínculo na integração não gera nada (nunca erro, nunca dado de outra loja)', async () => {
    const { consulta: q } = await consulta();
    expect(await adapter.buscarEventos({ ...q, lojasExternas: ['LOJA-QUE-NAO-EXISTE'] })).toEqual([]);
  });
});
