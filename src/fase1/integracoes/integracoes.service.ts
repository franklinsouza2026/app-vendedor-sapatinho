// Central de Integrações (T1/T3) — uma integração ERP por provedor por
// empresa. Estrutura pronta para Linx (credencial, lojas vinculadas, vínculo
// de vendedores pela matrícula ERP/ExternalIdentity, saúde), sem conectar a
// Linx real nesta rodada.
import { Prisma, ProvedorIntegracao } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db';
import { env } from '../../config';
import { registrarEventoAuditoria } from '../../identidade/auditoria.service';
import { adapterDoProvedor, PROVEDORES_SO_DESENVOLVIMENTO } from '../../integracoes/erp';
import { mascarar } from '../../utils/cripto';
import { ErroHttp, invalido, naoEncontrado } from '../../utils/erro-http';
import { cifrarCredencial, decifrarCredencial, sufixoDaCredencial } from './segredos';

/** Configuração NÃO sensível. Campos com cara de segredo são recusados (o lugar deles é a credencial cifrada). */
export const configuracaoSchema = z
  .object({
    urlBase: z.string().url().max(300).optional(),
    observacao: z.string().max(300).optional(),
    // Linx Microvix: IdPortal (parâmetro obrigatório do WebService de Saída). Não é segredo.
    portal: z.number().int().positive().max(2_147_483_647).optional(),
    // Data de corte do BACKFILL (YYYY-MM-DD). Técnico; sem ela, usa a janela de reabertura.
    backfillDesde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .strict();

function garantirProvedorPermitido(provedor: ProvedorIntegracao) {
  if (env.NODE_ENV === 'production' && PROVEDORES_SO_DESENVOLVIMENTO.includes(provedor)) {
    throw new ErroHttp(400, 'provedor_proibido', `O provedor ${provedor} gera dados de demonstração e não pode ser usado em produção/piloto.`);
  }
}

export function serializarIntegracao(i: Prisma.IntegracaoGetPayload<{ include: { lojas: true } }>) {
  return {
    id: i.id,
    provedor: i.provedor,
    status: i.status,
    configuracao: i.configuracao,
    credencial: i.credencialCiphertext ? (mascarar(i.credencialSufixo) ?? '••••••••') : null,
    credencialDefinida: Boolean(i.credencialCiphertext),
    credencialAtualizadaEm: i.credencialAtualizadaEm,
    ultimaSyncEm: i.ultimaSyncEm,
    ultimaSyncSucessoEm: i.ultimaSyncSucessoEm,
    ultimaVendaEm: i.ultimaVendaEm,
    lojas: i.lojas.map((l) => ({ lojaId: l.lojaId, codigoExterno: l.codigoExterno })),
    atualizadoEm: i.updatedAt,
  };
}

export async function listarIntegracoes(empresaId: string) {
  const lista = await prisma.integracao.findMany({ where: { empresaId }, include: { lojas: true }, orderBy: { createdAt: 'asc' } });
  return lista.map(serializarIntegracao);
}

export async function buscarIntegracao(empresaId: string, id: string) {
  const integracao = await prisma.integracao.findFirst({ where: { id, empresaId }, include: { lojas: true } });
  if (!integracao) throw naoEncontrado('integração');
  return integracao;
}

export async function criarIntegracao(empresaId: string, atorId: string, provedor: ProvedorIntegracao, configuracao: unknown) {
  garantirProvedorPermitido(provedor);
  const config = configuracaoSchema.parse(configuracao ?? {});
  try {
    const criada = await prisma.integracao.create({ data: { empresaId, provedor, configuracao: config, atualizadoPor: atorId }, include: { lojas: true } });
    await registrarEventoAuditoria({ empresaId, acao: 'INTEGRATION_CREATED', actorId: atorId, metadata: { integracaoId: criada.id, provedor } });
    return serializarIntegracao(criada);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new ErroHttp(409, 'conflict', 'Já existe uma integração deste provedor nesta empresa.');
    throw err;
  }
}

export async function atualizarConfiguracao(empresaId: string, atorId: string, id: string, configuracao: unknown) {
  await buscarIntegracao(empresaId, id);
  const config = configuracaoSchema.parse(configuracao ?? {});
  const atualizada = await prisma.integracao.update({ where: { id }, data: { configuracao: config, atualizadoPor: atorId }, include: { lojas: true } });
  await registrarEventoAuditoria({ empresaId, acao: 'INTEGRATION_CONFIG_UPDATED', actorId: atorId, metadata: { integracaoId: id, campos: Object.keys(config) } });
  return serializarIntegracao(atualizada);
}

/** Define/substitui (rotaciona) a credencial. Nunca devolve, nunca audita o valor. */
export async function definirCredencial(empresaId: string, atorId: string, id: string, credencial: string) {
  await buscarIntegracao(empresaId, id);
  const texto = credencial.trim();
  if (texto.length < 8 || texto.length > 4000) throw invalido('Credencial deve ter entre 8 e 4000 caracteres.');
  const cifrada = cifrarCredencial(texto);
  const atualizada = await prisma.integracao.update({
    where: { id },
    data: {
      credencialCiphertext: cifrada.ciphertextBase64,
      credencialIv: cifrada.ivBase64,
      credencialAuthTag: cifrada.authTagBase64,
      credencialKeyVersion: cifrada.keyVersion,
      credencialSufixo: sufixoDaCredencial(texto),
      credencialAtualizadaEm: new Date(),
      atualizadoPor: atorId,
    },
    include: { lojas: true },
  });
  await registrarEventoAuditoria({ empresaId, acao: 'INTEGRATION_CREDENTIAL_ROTATED', actorId: atorId, metadata: { integracaoId: id } });
  return serializarIntegracao(atualizada);
}

export function credencialEmClaro(i: { credencialCiphertext: string | null; credencialIv: string | null; credencialAuthTag: string | null; credencialKeyVersion: number | null }): string | null {
  if (!i.credencialCiphertext || !i.credencialIv || !i.credencialAuthTag) return null;
  return decifrarCredencial({ ciphertextBase64: i.credencialCiphertext, ivBase64: i.credencialIv, authTagBase64: i.credencialAuthTag, keyVersion: i.credencialKeyVersion ?? 1 });
}

export async function alterarStatus(empresaId: string, atorId: string, id: string, status: 'ATIVA' | 'DESATIVADA') {
  const integracao = await buscarIntegracao(empresaId, id);
  if (status === 'ATIVA') {
    garantirProvedorPermitido(integracao.provedor);
    if (integracao.lojas.length === 0) throw invalido('Vincule ao menos uma loja antes de ativar a integração.');
  }
  const atualizada = await prisma.integracao.update({ where: { id }, data: { status, atualizadoPor: atorId }, include: { lojas: true } });
  await registrarEventoAuditoria({ empresaId, acao: status === 'ATIVA' ? 'INTEGRATION_ACTIVATED' : 'INTEGRATION_DEACTIVATED', actorId: atorId, metadata: { integracaoId: id } });
  return serializarIntegracao(atualizada);
}

export async function vincularLoja(empresaId: string, atorId: string, id: string, lojaId: string, codigoExterno: string) {
  await buscarIntegracao(empresaId, id);
  const loja = await prisma.loja.findFirst({ where: { id: lojaId, empresaId } });
  if (!loja) throw naoEncontrado('loja');
  const codigo = codigoExterno.trim();
  if (!codigo || codigo.length > 64) throw invalido('Código externo da loja inválido.');
  try {
    await prisma.integracaoLoja.upsert({ where: { integracaoId_lojaId: { integracaoId: id, lojaId } }, create: { integracaoId: id, lojaId, codigoExterno: codigo }, update: { codigoExterno: codigo } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new ErroHttp(409, 'conflict', 'Este código externo já está vinculado a outra loja.');
    throw err;
  }
  await registrarEventoAuditoria({ empresaId, acao: 'INTEGRATION_STORE_LINKED', actorId: atorId, metadata: { integracaoId: id, lojaId, codigoExterno: codigo } });
  return serializarIntegracao(await buscarIntegracao(empresaId, id));
}

export async function desvincularLoja(empresaId: string, atorId: string, id: string, lojaId: string) {
  await buscarIntegracao(empresaId, id);
  await prisma.integracaoLoja.deleteMany({ where: { integracaoId: id, lojaId } });
  await registrarEventoAuditoria({ empresaId, acao: 'INTEGRATION_STORE_UNLINKED', actorId: atorId, metadata: { integracaoId: id, lojaId } });
  return serializarIntegracao(await buscarIntegracao(empresaId, id));
}

export async function testarConexao(empresaId: string, id: string) {
  const integracao = await buscarIntegracao(empresaId, id);
  garantirProvedorPermitido(integracao.provedor);
  const adapter = adapterDoProvedor(integracao.provedor);
  try {
    return await adapter.testarConexao({ integracaoId: id, empresaId, lojasExternas: integracao.lojas.map((l) => l.codigoExterno), credencial: credencialEmClaro(integracao), configuracao: integracao.configuracao as Record<string, unknown> });
  } catch {
    return { ok: false, mensagem: 'Falha ao testar a conexão (detalhe registrado no servidor).' };
  }
}
