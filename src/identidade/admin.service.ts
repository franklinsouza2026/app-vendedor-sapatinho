// Admin Foundation — gestão de usuários (Fatia 7.5A, seções 35-41). Toda
// consulta é escopada por empresaId (e por lojaId quando o chamador é
// GERENTE) a partir de req.auth, nunca de parâmetro do client — mesmo
// princípio estrutural anti-IDOR já usado em Missões/Coach/Treinador.
// Nenhuma mutação aqui apaga uma linha: bloquear/desligar são transições de
// `status`, sempre reversíveis, sempre com AuditEvent.
import { StatusConta, Papel } from '@prisma/client';
import { prisma } from '../db';
import { registrarEventoAuditoria } from './auditoria.service';
import { IdentidadeError } from './erros';

function mascarar(v: { cpfUltimosDigitos: string | null }): string | null {
  return v.cpfUltimosDigitos ? `***.***.***-${v.cpfUltimosDigitos}` : null;
}

export async function listarVendedores(params: {
  empresaId: string;
  lojaIdRestrita?: string; // presente quando o chamador é GERENTE — só a própria loja
  status?: StatusConta;
  papel?: Papel;
  busca?: string;
}) {
  const vendedores = await prisma.vendedor.findMany({
    where: {
      empresaId: params.empresaId,
      ...(params.lojaIdRestrita ? { lojaId: params.lojaIdRestrita } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.papel ? { papel: params.papel } : {}),
      ...(params.busca ? { nome: { contains: params.busca, mode: 'insensitive' } } : {}),
    },
    select: {
      id: true,
      nome: true,
      matriculaErp: true,
      papel: true,
      status: true,
      cpfUltimosDigitos: true,
      createdAt: true,
      loja: { select: { id: true, nome: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return vendedores.map((v) => ({ ...v, cpfMascarado: mascarar(v), cpfUltimosDigitos: undefined }));
}

async function buscarVendedorNoEscopo(id: string, empresaId: string, lojaIdRestrita?: string) {
  const vendedor = await prisma.vendedor.findFirst({
    where: { id, empresaId, ...(lojaIdRestrita ? { lojaId: lojaIdRestrita } : {}) },
    include: { loja: { select: { id: true, nome: true } }, identidadesExternas: true },
  });
  // 404 genérico (nunca 403) — não confirma se o id existe em outro escopo
  // (mesmo padrão anti-IDOR de getMissaoPorId, Fatia 7).
  if (!vendedor) throw new IdentidadeError(404, 'vendedor_nao_encontrado', 'vendedor não encontrado');
  return vendedor;
}

export async function detalharVendedor(id: string, empresaId: string, lojaIdRestrita?: string) {
  const vendedor = await buscarVendedorNoEscopo(id, empresaId, lojaIdRestrita);
  return {
    id: vendedor.id,
    nome: vendedor.nome,
    matriculaErp: vendedor.matriculaErp,
    papel: vendedor.papel,
    status: vendedor.status,
    cpfMascarado: mascarar(vendedor),
    createdAt: vendedor.createdAt,
    loja: vendedor.loja,
    identidadesExternas: vendedor.identidadesExternas.map((e) => ({
      provider: e.provider,
      status: e.status,
      matchMethod: e.matchMethod,
      verifiedAt: e.verifiedAt,
    })),
  };
}

const TRANSICOES: Record<string, { de: StatusConta[]; para: StatusConta; acao: Parameters<typeof registrarEventoAuditoria>[0]['acao'] }> = {
  bloquear: { de: ['ACTIVE'], para: 'BLOCKED', acao: 'USER_BLOCKED' },
  desbloquear: { de: ['BLOCKED'], para: 'ACTIVE', acao: 'USER_UNBLOCKED' },
  desligar: { de: ['ACTIVE', 'BLOCKED', 'PENDING_ACTIVATION'], para: 'OFFBOARDED', acao: 'USER_OFFBOARDED' },
  reativar: { de: ['OFFBOARDED'], para: 'ACTIVE', acao: 'USER_REACTIVATED' },
};

async function transicionarStatus(
  transicao: keyof typeof TRANSICOES,
  id: string,
  empresaId: string,
  actorId: string,
  lojaIdRestrita?: string
) {
  // Um Admin bloqueando/desligando a PRÓPRIA conta se auto-tranca: requireAuth
  // rejeita o JWT dele no request seguinte (mesmo que fosse pra desfazer),
  // e sem outro Admin ativo na empresa ninguém mais consegue reverter via
  // API. Guarda barata, sem contrapartida real de produto perdida.
  if ((transicao === 'bloquear' || transicao === 'desligar') && id === actorId) {
    throw new IdentidadeError(400, 'nao_pode_afetar_a_propria_conta', `não é possível "${transicao}" a própria conta`);
  }

  const vendedor = await buscarVendedorNoEscopo(id, empresaId, lojaIdRestrita);
  const regra = TRANSICOES[transicao];

  // updateMany condicional (nunca ler-então-escrever) — 2 admins clicando
  // "bloquear" ao mesmo tempo só produzem 1 transição real e 1 erro claro
  // pro segundo, mesmo padrão de concorrência das Fatias 4-7.
  const resultado = await prisma.vendedor.updateMany({
    where: { id, status: { in: regra.de } },
    data: { status: regra.para },
  });
  if (resultado.count !== 1) {
    throw new IdentidadeError(409, 'transicao_invalida', `vendedor não está em um estado válido para "${transicao}" (estado atual: ${vendedor.status})`);
  }

  await registrarEventoAuditoria({
    empresaId,
    acao: regra.acao,
    actorId,
    targetId: id,
    metadata: { estadoAnterior: vendedor.status, estadoNovo: regra.para },
  });

  return { id, statusAnterior: vendedor.status, statusNovo: regra.para };
}

export const bloquearVendedor = (id: string, empresaId: string, actorId: string, lojaIdRestrita?: string) =>
  transicionarStatus('bloquear', id, empresaId, actorId, lojaIdRestrita);
export const desbloquearVendedor = (id: string, empresaId: string, actorId: string, lojaIdRestrita?: string) =>
  transicionarStatus('desbloquear', id, empresaId, actorId, lojaIdRestrita);
export const desligarVendedor = (id: string, empresaId: string, actorId: string, lojaIdRestrita?: string) =>
  transicionarStatus('desligar', id, empresaId, actorId, lojaIdRestrita);
export const reativarVendedor = (id: string, empresaId: string, actorId: string, lojaIdRestrita?: string) =>
  transicionarStatus('reativar', id, empresaId, actorId, lojaIdRestrita);

/**
 * Realocação (Fatia 9.6, seção 11) — só ADMIN muda a loja de um vendedor/
 * gerente já existente. Nunca reatribui histórico retroativamente: `Meta`/
 * `IndicadorRealizado`/`ManagerAlert`/`OneOnOne`/etc já guardam seu próprio
 * `lojaId` no momento em que foram criados, então mudar `Vendedor.lojaId`
 * só vale PROSPECTIVAMENTE — o passado nunca é reescrito. Preserva
 * `matriculaErp` (é reaproveitada como identificador visível na nova loja);
 * colisão de matrícula na loja de destino é um 409 claro, nunca um "silêncio".
 */
export async function realocarVendedor(id: string, novaLojaId: string, empresaId: string, actorId: string) {
  const vendedor = await buscarVendedorNoEscopo(id, empresaId);

  const novaLoja = await prisma.loja.findUnique({ where: { id: novaLojaId } });
  if (!novaLoja || novaLoja.empresaId !== empresaId) {
    throw new IdentidadeError(400, 'loja_fora_do_escopo', 'loja de destino não pertence à empresa do usuário logado');
  }
  if (novaLoja.id === vendedor.lojaId) {
    throw new IdentidadeError(409, 'ja_esta_nesta_loja', 'vendedor já está nesta loja');
  }

  const colisao = await prisma.vendedor.findUnique({ where: { lojaId_matriculaErp: { lojaId: novaLojaId, matriculaErp: vendedor.matriculaErp } } });
  if (colisao) {
    throw new IdentidadeError(409, 'matricula_duplicada', 'já existe um vendedor com esta matrícula na loja de destino');
  }

  const lojaAnteriorId = vendedor.lojaId;
  await prisma.vendedor.update({ where: { id }, data: { lojaId: novaLojaId } });

  await registrarEventoAuditoria({
    empresaId,
    acao: 'USER_RELOCATED',
    actorId,
    targetId: id,
    metadata: { lojaAnteriorId, lojaNovaId: novaLojaId },
  });

  return { id, lojaAnteriorId, lojaNovaId: novaLojaId };
}

export async function vincularIdentidadeExterna(params: {
  vendedorId: string;
  empresaId: string;
  provider: 'LINX';
  externalSellerId?: string;
  externalEmployeeId?: string;
  externalStoreId?: string;
  matchMethod: 'CPF' | 'EXTERNAL_ID' | 'SELLER_CODE' | 'MANUAL';
  actorId: string;
}) {
  await buscarVendedorNoEscopo(params.vendedorId, params.empresaId);

  try {
    const identidade = await prisma.externalIdentity.create({
      data: {
        empresaId: params.empresaId,
        vendedorId: params.vendedorId,
        provider: params.provider,
        externalSellerId: params.externalSellerId,
        externalEmployeeId: params.externalEmployeeId,
        externalStoreId: params.externalStoreId,
        matchMethod: params.matchMethod,
        status: params.matchMethod === 'MANUAL' ? 'VERIFIED' : 'PENDING',
        verifiedAt: params.matchMethod === 'MANUAL' ? new Date() : null,
      },
    });

    await registrarEventoAuditoria({
      empresaId: params.empresaId,
      acao: 'ERP_IDENTITY_LINKED',
      actorId: params.actorId,
      targetId: params.vendedorId,
      metadata: { provider: params.provider, matchMethod: params.matchMethod },
    });

    return identidade;
  } catch (err) {
    if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'P2002') {
      throw new IdentidadeError(409, 'identidade_ja_vinculada', 'já existe um vínculo com este provider para este vendedor — desvincule antes');
    }
    throw err;
  }
}

export async function desvincularIdentidadeExterna(vendedorId: string, empresaId: string, provider: 'LINX', actorId: string) {
  await buscarVendedorNoEscopo(vendedorId, empresaId);

  const resultado = await prisma.externalIdentity.deleteMany({ where: { vendedorId, provider } });
  if (resultado.count === 0) throw new IdentidadeError(404, 'identidade_nao_encontrada', 'nenhum vínculo encontrado para este provider');

  await registrarEventoAuditoria({
    empresaId,
    acao: 'ERP_IDENTITY_UNLINKED',
    actorId,
    targetId: vendedorId,
    metadata: { provider },
  });
}
