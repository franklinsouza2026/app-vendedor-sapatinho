// OneOnOne — Conversa 1:1 (Fatia 9, seção 24-30). Notas são PRIVADAS do
// gerente: nunca aparecem em nenhuma rota do vendedor, nunca no Feed, nunca
// no Conselheiro, nunca pra um gerente de OUTRA loja (mesmo escopo por
// `lojaId` já usado em todo o resto do produto — `garantirVendedorNoEscopoDoGerente`).
import { StatusOneOnOne } from '@prisma/client';
import { prisma } from '../db';
import { registrarEventoAuditoria } from '../identidade/auditoria.service';
import { garantirVendedorNoEscopoDoGerente } from '../universidade/manager-scope.service';
import { ManagerError, sanitizarTextoLivre } from './constantes';

/** Roteiro sugerido (seção 26) — conteúdo ESTÁTICO, nunca gerado por IA e
 * nunca obrigatório: só um apoio pro gerente que não sabe por onde começar. */
export const ROTEIRO_SUGERIDO_1A1 = [
  'Como você está se sentindo em relação ao seu trabalho nas últimas semanas?',
  'O que tem funcionado bem pra você no dia a dia da loja?',
  'Existe algo te travando ou dificultando seu atendimento?',
  'Como você avalia seu próprio progresso em relação às suas metas?',
  'Tem algum treinamento ou tema que você gostaria de desenvolver mais?',
  'Como posso te ajudar melhor como gerente?',
  'Vamos combinar 1 ou 2 compromissos concretos pros próximos dias?',
];

export interface CriarOneOnOneInput {
  empresaId: string;
  lojaId: string;
  managerId: string;
  sellerId: string;
  scheduledAt?: Date;
}

export async function criarOneOnOne(input: CriarOneOnOneInput) {
  await garantirVendedorNoEscopoDoGerente(input.sellerId, input.empresaId, input.lojaId);

  const encontro = await prisma.oneOnOne.create({
    data: { empresaId: input.empresaId, lojaId: input.lojaId, managerId: input.managerId, sellerId: input.sellerId, scheduledAt: input.scheduledAt, status: 'SCHEDULED' },
  });

  await registrarEventoAuditoria({ empresaId: input.empresaId, acao: 'ONE_ON_ONE_CREATED', actorId: input.managerId, metadata: { oneOnOneId: encontro.id, sellerId: input.sellerId } });
  return encontro;
}

/** Sempre filtrado por `lojaId` — um gerente de outra loja recebe o mesmo
 * 404 genérico de qualquer outro recurso fora de escopo (anti-IDOR). */
export async function buscarOneOnOneNoEscopo(empresaId: string, lojaId: string, id: string) {
  const encontro = await prisma.oneOnOne.findFirst({ where: { id, empresaId, lojaId } });
  if (!encontro) throw new ManagerError('not_found', '1:1 não encontrado');
  return encontro;
}

export async function listarOneOnOnesDoVendedor(empresaId: string, lojaId: string, sellerId: string) {
  await garantirVendedorNoEscopoDoGerente(sellerId, empresaId, lojaId);
  return prisma.oneOnOne.findMany({ where: { empresaId, lojaId, sellerId }, orderBy: { createdAt: 'desc' } });
}

export async function iniciarOneOnOne(empresaId: string, lojaId: string, id: string) {
  await buscarOneOnOneNoEscopo(empresaId, lojaId, id);
  await prisma.oneOnOne.updateMany({ where: { id, empresaId, lojaId, status: { in: ['SCHEDULED'] } }, data: { status: 'IN_PROGRESS', startedAt: new Date() } });
}

export interface ConcluirOneOnOneInput {
  pontosPositivos?: string;
  pontosAtencao?: string;
  compromissos?: string;
  proximaRevisaoEm?: Date;
}

/** Conclui com notas — sempre sanitizadas (XSS, seção 92) e sempre
 * atômico via `updateMany`+`count` (2 conclusões concorrentes nunca geram 2
 * eventos de auditoria pro mesmo encontro). */
export async function concluirOneOnOne(empresaId: string, lojaId: string, id: string, notas: ConcluirOneOnOneInput, actorId: string) {
  await buscarOneOnOneNoEscopo(empresaId, lojaId, id);

  const resultado = await prisma.oneOnOne.updateMany({
    where: { id, empresaId, lojaId, status: { in: ['SCHEDULED', 'IN_PROGRESS'] } },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
      pontosPositivos: notas.pontosPositivos ? sanitizarTextoLivre(notas.pontosPositivos) : undefined,
      pontosAtencao: notas.pontosAtencao ? sanitizarTextoLivre(notas.pontosAtencao) : undefined,
      compromissos: notas.compromissos ? sanitizarTextoLivre(notas.compromissos) : undefined,
      proximaRevisaoEm: notas.proximaRevisaoEm,
    },
  });

  if (resultado.count === 1) await registrarEventoAuditoria({ empresaId, acao: 'ONE_ON_ONE_COMPLETED', actorId, metadata: { oneOnOneId: id } });
}

export async function cancelarOneOnOne(empresaId: string, lojaId: string, id: string, actorId: string) {
  await buscarOneOnOneNoEscopo(empresaId, lojaId, id);
  const resultado = await prisma.oneOnOne.updateMany({ where: { id, empresaId, lojaId, status: { in: ['SCHEDULED', 'IN_PROGRESS'] } }, data: { status: 'CANCELLED' as StatusOneOnOne } });
  if (resultado.count === 1) await registrarEventoAuditoria({ empresaId, acao: 'ONE_ON_ONE_CANCELLED', actorId, metadata: { oneOnOneId: id } });
}
