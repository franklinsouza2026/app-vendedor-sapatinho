// Gestão de lojas pelo Admin da empresa (Fatia 9.7, P0). Até aqui a única
// forma de existir uma loja era `scripts/seed.ts` — a Estrutura da Empresa era
// puramente contemplativa e abrir a 2ª loja exigia SQL.
//
// FRONTEIRA DELIBERADA: o Admin é master DENTRO da própria empresa. Criar
// EMPRESA não é operação de Company Admin e não existe papel de plataforma /
// super admin neste produto — então esta fatia NÃO cria CRUD de Empresa
// (registrado na fonte de verdade em vez de inventado). `empresaId` vem sempre
// de `req.auth`, nunca do corpo da requisição.
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { registrarEventoAuditoria } from './auditoria.service';
import { IdentidadeError } from './erros';

async function garantirLojaNaEmpresa(lojaId: string, empresaId: string) {
  const loja = await prisma.loja.findUnique({ where: { id: lojaId } });
  // Mesmo 404 pra "não existe" e "é de outra empresa" (anti-IDOR).
  if (!loja || loja.empresaId !== empresaId) {
    throw new IdentidadeError(404, 'loja_nao_encontrada', 'loja não encontrada');
  }
  return loja;
}

export async function listarLojasDaEmpresa(empresaId: string) {
  const lojas = await prisma.loja.findMany({
    where: { empresaId },
    orderBy: [{ ativa: 'desc' }, { nome: 'asc' }],
  });

  // Contagem de pessoas por loja em 1 query agregada — nunca 1 query por loja.
  const contagens = await prisma.vendedor.groupBy({
    by: ['lojaId', 'papel'],
    where: { empresaId, status: 'ACTIVE' },
    _count: true,
  });

  return lojas.map((loja) => {
    const daLoja = contagens.filter((c) => c.lojaId === loja.id);
    return {
      id: loja.id,
      nome: loja.nome,
      codigoErp: loja.codigoErp,
      ativa: loja.ativa,
      gerentes: daLoja.find((c) => c.papel === 'GERENTE')?._count ?? 0,
      vendedores: daLoja.find((c) => c.papel === 'VENDEDOR')?._count ?? 0,
    };
  });
}

export async function criarLoja(dados: { nome: string; codigoErp: string }, empresaId: string, actorId: string) {
  let loja;
  try {
    loja = await prisma.loja.create({
      data: { empresaId, nome: dados.nome.trim(), codigoErp: dados.codigoErp.trim() },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new IdentidadeError(409, 'codigo_erp_duplicado', 'já existe uma loja com este código de ERP nesta empresa');
    }
    throw err;
  }

  await registrarEventoAuditoria({
    empresaId,
    acao: 'STORE_CREATED',
    actorId,
    metadata: { lojaId: loja.id, nome: loja.nome, codigoErp: loja.codigoErp },
  });

  return loja;
}

export async function atualizarLoja(
  lojaId: string,
  dados: { nome?: string; codigoErp?: string },
  empresaId: string,
  actorId: string
) {
  const anterior = await garantirLojaNaEmpresa(lojaId, empresaId);

  let loja;
  try {
    loja = await prisma.loja.update({
      where: { id: lojaId },
      data: {
        ...(dados.nome !== undefined ? { nome: dados.nome.trim() } : {}),
        ...(dados.codigoErp !== undefined ? { codigoErp: dados.codigoErp.trim() } : {}),
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new IdentidadeError(409, 'codigo_erp_duplicado', 'já existe uma loja com este código de ERP nesta empresa');
    }
    throw err;
  }

  await registrarEventoAuditoria({
    empresaId,
    acao: 'STORE_UPDATED',
    actorId,
    metadata: { lojaId, nomeAnterior: anterior.nome, nomeNovo: loja.nome, codigoErpAnterior: anterior.codigoErp, codigoErpNovo: loja.codigoErp },
  });

  return loja;
}

/**
 * Inativa a loja — nunca apaga. Histórico de venda, meta, gamificação e
 * competição dos vendedores dela continua íntegro (mesmo princípio de
 * offboarding de pessoa, Fatia 7.5A).
 *
 * Bloqueia se ainda houver gente ativa lotada nela: inativar uma loja com
 * equipe deixaria vendedores impossibilitados de logar sem nenhum aviso ao
 * Admin. O caminho correto é realocar (já existe) ou desligar as pessoas antes.
 */
export async function inativarLoja(lojaId: string, empresaId: string, actorId: string) {
  const loja = await garantirLojaNaEmpresa(lojaId, empresaId);
  if (!loja.ativa) throw new IdentidadeError(409, 'loja_ja_inativa', 'esta loja já está inativa');

  const pessoasAtivas = await prisma.vendedor.count({
    where: { lojaId, status: { in: ['ACTIVE', 'PENDING_ACTIVATION'] } },
  });
  if (pessoasAtivas > 0) {
    throw new IdentidadeError(
      409,
      'loja_com_pessoas_ativas',
      `esta loja ainda tem ${pessoasAtivas} pessoa(s) ativa(s) — realoque ou desligue antes de inativar`
    );
  }

  const atualizada = await prisma.loja.update({ where: { id: lojaId }, data: { ativa: false } });

  await registrarEventoAuditoria({ empresaId, acao: 'STORE_DEACTIVATED', actorId, metadata: { lojaId, nome: loja.nome } });

  return atualizada;
}

export async function reativarLoja(lojaId: string, empresaId: string, actorId: string) {
  const loja = await garantirLojaNaEmpresa(lojaId, empresaId);
  if (loja.ativa) throw new IdentidadeError(409, 'loja_ja_ativa', 'esta loja já está ativa');

  const atualizada = await prisma.loja.update({ where: { id: lojaId }, data: { ativa: true } });

  await registrarEventoAuditoria({ empresaId, acao: 'STORE_REACTIVATED', actorId, metadata: { lojaId, nome: loja.nome } });

  return atualizada;
}
