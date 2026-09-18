// Gestão de lojas e reemissão de acesso (Fatia 9.7, P0).
import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../db';
import { criarFixtureEmpresa } from '../gamificacao/test-helpers';
import { atualizarLoja, criarLoja, inativarLoja, listarLojasDaEmpresa, reativarLoja } from './lojas.service';
import { preAutorizarVendedor, reemitirAcesso, ativarConta } from './ativacao.service';

const CPF_VALIDO = '52998224725';
const OUTRO_CPF_VALIDO = '11144477735';

describe('Gestão de lojas — Admin da empresa', () => {
  it('cria loja dentro da própria empresa e ela aparece na listagem com contagem de pessoas', async () => {
    const { empresa, vendedor } = await criarFixtureEmpresa();

    const loja = await criarLoja({ nome: 'Loja Shopping', codigoErp: `SHOP-${randomUUID()}` }, empresa.id, vendedor.id);
    expect(loja.empresaId).toBe(empresa.id);
    expect(loja.ativa).toBe(true);

    const lojas = await listarLojasDaEmpresa(empresa.id);
    const criada = lojas.find((l) => l.id === loja.id)!;
    expect(criada.nome).toBe('Loja Shopping');
    expect(criada.vendedores).toBe(0);
  });

  it('empresaId vem sempre do contexto autenticado — loja nunca nasce em outra empresa', async () => {
    const a = await criarFixtureEmpresa();
    const b = await criarFixtureEmpresa();

    const loja = await criarLoja({ nome: 'X', codigoErp: `X-${randomUUID()}` }, a.empresa.id, a.vendedor.id);

    expect(loja.empresaId).toBe(a.empresa.id);
    const lojasDeB = await listarLojasDaEmpresa(b.empresa.id);
    expect(lojasDeB.some((l) => l.id === loja.id)).toBe(false);
  });

  it('código de ERP duplicado na mesma empresa é rejeitado (é a chave que o ERP e o login usam)', async () => {
    const { empresa, vendedor } = await criarFixtureEmpresa();
    const codigo = `DUP-${randomUUID()}`;

    await criarLoja({ nome: 'Primeira', codigoErp: codigo }, empresa.id, vendedor.id);
    await expect(criarLoja({ nome: 'Segunda', codigoErp: codigo }, empresa.id, vendedor.id)).rejects.toMatchObject({
      type: 'codigo_erp_duplicado',
      status: 409,
    });
  });

  it('o mesmo código de ERP pode existir em empresas diferentes (unicidade é por empresa)', async () => {
    const a = await criarFixtureEmpresa();
    const b = await criarFixtureEmpresa();
    const codigo = `COMPARTILHADO-${randomUUID()}`;

    await criarLoja({ nome: 'Loja A', codigoErp: codigo }, a.empresa.id, a.vendedor.id);
    await expect(criarLoja({ nome: 'Loja B', codigoErp: codigo }, b.empresa.id, b.vendedor.id)).resolves.toBeTruthy();
  });

  it('cross-company: nunca edita, inativa nem reativa loja de outra empresa (404 genérico)', async () => {
    const a = await criarFixtureEmpresa();
    const b = await criarFixtureEmpresa();

    await expect(atualizarLoja(b.loja.id, { nome: 'Sequestrada' }, a.empresa.id, a.vendedor.id)).rejects.toMatchObject({ status: 404 });
    await expect(inativarLoja(b.loja.id, a.empresa.id, a.vendedor.id)).rejects.toMatchObject({ status: 404 });
    await expect(reativarLoja(b.loja.id, a.empresa.id, a.vendedor.id)).rejects.toMatchObject({ status: 404 });

    const intacta = await prisma.loja.findUniqueOrThrow({ where: { id: b.loja.id } });
    expect(intacta.nome).toBe(b.loja.nome);
    expect(intacta.ativa).toBe(true);
  });

  it('NUNCA inativa loja que ainda tem gente ativa — obriga realocar/desligar antes', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();

    await expect(inativarLoja(loja.id, empresa.id, vendedor.id)).rejects.toMatchObject({ type: 'loja_com_pessoas_ativas' });
    expect((await prisma.loja.findUniqueOrThrow({ where: { id: loja.id } })).ativa).toBe(true);
  });

  it('inativa loja vazia e reativa depois — nunca apaga, histórico preservado', async () => {
    const { empresa, vendedor } = await criarFixtureEmpresa();
    const loja = await criarLoja({ nome: 'Temporária', codigoErp: `TMP-${randomUUID()}` }, empresa.id, vendedor.id);

    await inativarLoja(loja.id, empresa.id, vendedor.id);
    expect((await prisma.loja.findUniqueOrThrow({ where: { id: loja.id } })).ativa).toBe(false);
    // A linha continua existindo — inativar nunca é delete.
    expect(await prisma.loja.count({ where: { id: loja.id } })).toBe(1);

    await reativarLoja(loja.id, empresa.id, vendedor.id);
    expect((await prisma.loja.findUniqueOrThrow({ where: { id: loja.id } })).ativa).toBe(true);
  });

  it('inativar duas vezes é rejeitado com erro claro, nunca silencioso', async () => {
    const { empresa, vendedor } = await criarFixtureEmpresa();
    const loja = await criarLoja({ nome: 'Y', codigoErp: `Y-${randomUUID()}` }, empresa.id, vendedor.id);

    await inativarLoja(loja.id, empresa.id, vendedor.id);
    await expect(inativarLoja(loja.id, empresa.id, vendedor.id)).rejects.toMatchObject({ type: 'loja_ja_inativa' });
  });
});

describe('Reemissão de acesso — Admin', () => {
  it('reemite acesso: token anterior é revogado, senha zerada e o usuário define a própria senha nova', async () => {
    const { empresa, loja, vendedor: admin } = await criarFixtureEmpresa();
    const { vendedor, tokenAtivacao: tokenOriginal } = await preAutorizarVendedor({
      empresaId: empresa.id,
      lojaId: loja.id,
      matriculaErp: `M-${randomUUID()}`,
      nome: 'Pessoa Teste',
      cpf: CPF_VALIDO,
      actorId: admin.id,
    });

    // Ativa normalmente e fica com senha própria.
    await ativarConta({ codigoErpLoja: loja.codigoErp, cpf: CPF_VALIDO, token: tokenOriginal, senha: 'senha-antiga-123' });
    expect((await prisma.vendedor.findUniqueOrThrow({ where: { id: vendedor.id } })).senhaHash).not.toBeNull();

    // Perdeu a senha → Admin reemite.
    const { tokenAtivacao: tokenNovo } = await reemitirAcesso({ vendedorId: vendedor.id, empresaId: empresa.id, actorId: admin.id });

    const apos = await prisma.vendedor.findUniqueOrThrow({ where: { id: vendedor.id } });
    expect(apos.senhaHash).toBeNull(); // a senha antiga deixou de valer
    expect(apos.status).toBe('PENDING_ACTIVATION');
    expect(tokenNovo).not.toBe(tokenOriginal);

    // O próprio usuário escolhe a senha nova, pelo fluxo de ativação já existente.
    const sessao = await ativarConta({ codigoErpLoja: loja.codigoErp, cpf: CPF_VALIDO, token: tokenNovo, senha: 'senha-nova-456' });
    expect(sessao.vendedor.id).toBe(vendedor.id);
  });

  it('o token ANTERIOR deixa de funcionar depois da reemissão (revogado, não apenas substituído)', async () => {
    const { empresa, loja, vendedor: admin } = await criarFixtureEmpresa();
    const { vendedor, tokenAtivacao: tokenOriginal } = await preAutorizarVendedor({
      empresaId: empresa.id,
      lojaId: loja.id,
      matriculaErp: `M-${randomUUID()}`,
      nome: 'Pessoa Teste',
      cpf: OUTRO_CPF_VALIDO,
      actorId: admin.id,
    });

    await reemitirAcesso({ vendedorId: vendedor.id, empresaId: empresa.id, actorId: admin.id });

    await expect(
      ativarConta({ codigoErpLoja: loja.codigoErp, cpf: OUTRO_CPF_VALIDO, token: tokenOriginal, senha: 'tentativa' })
    ).rejects.toMatchObject({ type: 'ativacao_invalida' });

    const revogados = await prisma.activationToken.count({ where: { vendedorId: vendedor.id, status: 'REVOKED' } });
    expect(revogados).toBe(1);
  });

  it('cross-company: Admin nunca reemite acesso de usuário de outra empresa', async () => {
    const a = await criarFixtureEmpresa();
    const b = await criarFixtureEmpresa();

    await expect(reemitirAcesso({ vendedorId: b.vendedor.id, empresaId: a.empresa.id, actorId: a.vendedor.id })).rejects.toMatchObject({
      status: 404,
    });

    // A conta da empresa B continua intacta (senha não foi zerada).
    expect((await prisma.vendedor.findUniqueOrThrow({ where: { id: b.vendedor.id } })).senhaHash).not.toBeNull();
  });

  it('conta bloqueada ou desligada não tem acesso reemitido — reemissão não é atalho de ciclo de vida', async () => {
    const { empresa, vendedor } = await criarFixtureEmpresa();

    await prisma.vendedor.update({ where: { id: vendedor.id }, data: { status: 'BLOCKED' } });
    await expect(reemitirAcesso({ vendedorId: vendedor.id, empresaId: empresa.id, actorId: vendedor.id })).rejects.toMatchObject({
      type: 'conta_inelegivel',
    });

    await prisma.vendedor.update({ where: { id: vendedor.id }, data: { status: 'OFFBOARDED' } });
    await expect(reemitirAcesso({ vendedorId: vendedor.id, empresaId: empresa.id, actorId: vendedor.id })).rejects.toMatchObject({
      type: 'conta_inelegivel',
    });
  });

  it('reemissão é auditada sem nunca guardar o token', async () => {
    const { empresa, vendedor } = await criarFixtureEmpresa();
    const { tokenAtivacao } = await reemitirAcesso({ vendedorId: vendedor.id, empresaId: empresa.id, actorId: vendedor.id });

    const evento = await prisma.auditEvent.findFirst({ where: { acao: 'ACCESS_REISSUED', targetId: vendedor.id } });
    expect(evento).not.toBeNull();
    expect(JSON.stringify(evento!.metadata)).not.toContain(tokenAtivacao);
  });
});
