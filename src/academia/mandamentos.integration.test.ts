// 13 Mandamentos das Vendas Sapatinho de Luxo (Fatia 7.5C, seção 82) — todo
// conteúdo usado aqui é SINTÉTICO e claramente marcado como teste, nunca
// vira seed de produção. Nunca inventamos os mandamentos reais.
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../db';
import { criarFixtureEmpresa } from '../gamificacao/test-helpers';
import { atualizarMandamento, checarCompletudeMandamentos, publicarMandamento, seedEstruturaMandamentos } from './mandamentos.service';

// MandamentoOficial é global e tem exatamente 13 linhas fixas (numero 1-13)
// — diferente do resto do catálogo da Academia (que sempre cria registros
// novos com código único por teste). Reseta pra um estado limpo antes de
// cada teste deste arquivo, pra nenhum teste depender da ordem dos outros.
beforeEach(async () => {
  await seedEstruturaMandamentos();
  await prisma.mandamentoOficial.updateMany({
    data: { conteudoOficial: null, explicacaoOpcional: null, exemploOpcional: null, status: 'DRAFT', versao: 1, publishedAt: null, approvedBy: null },
  });
});

describe('seedEstruturaMandamentos', () => {
  it('garante as 13 linhas (numero 1-13), idempotente', async () => {
    const total1 = await seedEstruturaMandamentos();
    const total2 = await seedEstruturaMandamentos();
    expect(total1).toBe(13);
    expect(total2).toBe(13);

    const numeros = (await prisma.mandamentoOficial.findMany({ orderBy: { numero: 'asc' } })).map((m) => m.numero);
    expect(numeros).toEqual(Array.from({ length: 13 }, (_, i) => i + 1));
  });

  it('nunca sobrescreve conteúdo já cadastrado ao rodar de novo', async () => {
    await seedEstruturaMandamentos();
    const { vendedor } = await criarFixtureEmpresa();
    await atualizarMandamento(1, { conteudoOficial: 'Conteúdo sintético de teste — mandamento 1.' }, vendedor.id);

    await seedEstruturaMandamentos();

    const m1 = await prisma.mandamentoOficial.findUniqueOrThrow({ where: { numero: 1 } });
    expect(m1.conteudoOficial).toBe('Conteúdo sintético de teste — mandamento 1.');
  });
});

describe('checarCompletudeMandamentos — gate de publicação (seção 42)', () => {
  it('12 mandamentos preenchidos → incompleto, publicação bloqueada estruturalmente', async () => {
    await seedEstruturaMandamentos();
    const { vendedor } = await criarFixtureEmpresa();

    for (let numero = 1; numero <= 12; numero++) {
      await atualizarMandamento(numero, { conteudoOficial: `Conteúdo sintético de teste — mandamento ${numero}.` }, vendedor.id);
    }

    const status = await checarCompletudeMandamentos();
    expect(status.completo).toBe(false);
    expect(status.faltando).toEqual([13]);
  });

  it('13 mandamentos preenchidos → estruturalmente completo', async () => {
    await seedEstruturaMandamentos();
    const { vendedor } = await criarFixtureEmpresa();

    for (let numero = 1; numero <= 13; numero++) {
      await atualizarMandamento(numero, { conteudoOficial: `Conteúdo sintético de teste — mandamento ${numero}.` }, vendedor.id);
    }

    const status = await checarCompletudeMandamentos();
    expect(status.completo).toBe(true);
    expect(status.faltando).toEqual([]);
  });
});

describe('publicarMandamento', () => {
  it('rejeita publicar mandamento sem conteúdo oficial cadastrado', async () => {
    await seedEstruturaMandamentos();
    const { vendedor } = await criarFixtureEmpresa();

    await expect(publicarMandamento(1, vendedor.id)).rejects.toMatchObject({ type: 'conteudo_ausente' });
  });

  it('publica um mandamento individual com conteúdo, e ele só aparece pro vendedor depois disso', async () => {
    await seedEstruturaMandamentos();
    const { vendedor } = await criarFixtureEmpresa();

    await atualizarMandamento(1, { conteudoOficial: 'Conteúdo sintético de teste — mandamento 1.' }, vendedor.id);
    const antes = await prisma.mandamentoOficial.findMany({ where: { status: 'PUBLISHED' } });
    expect(antes.some((m) => m.numero === 1)).toBe(false);

    await publicarMandamento(1, vendedor.id);
    const depois = await prisma.mandamentoOficial.findMany({ where: { status: 'PUBLISHED' } });
    expect(depois.some((m) => m.numero === 1)).toBe(true);
  });

  it('editar conteúdo de um mandamento já publicado volta pro status DRAFT e sobe a versão (nunca republica silenciosamente)', async () => {
    await seedEstruturaMandamentos();
    const { vendedor } = await criarFixtureEmpresa();

    await atualizarMandamento(1, { conteudoOficial: 'Versão 1 sintética de teste.' }, vendedor.id);
    await publicarMandamento(1, vendedor.id);

    const atualizado = await atualizarMandamento(1, { conteudoOficial: 'Versão 2 sintética de teste.' }, vendedor.id);
    expect(atualizado.status).toBe('DRAFT');
    expect(atualizado.versao).toBe(2);
  });
});
