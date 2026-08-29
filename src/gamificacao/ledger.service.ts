// Ledger imutável de XP e VendaCoins (seção 15 da fonte de verdade).
// Nunca usar saldo como única verdade — toda concessão/estorno é uma linha.
// Idempotente via idempotencyKey (unique no banco); reprocessar não duplica.
import { TipoEventoGamificacao } from '@prisma/client';
import { prisma } from '../db';
import { createLogger } from '../utils/logger';

const log = createLogger('gamificacao:ledger');

interface ContextoEvento {
  empresaId: string;
  lojaId: string;
  vendedorId: string;
  tipoEvento: TipoEventoGamificacao;
  referenciaTipo?: string;
  referenciaId?: string;
  idempotencyKey: string;
  regraVersao: number;
  ocorridoEm: Date;
}

/**
 * Concede XP. Idempotente: mesma idempotencyKey nunca duplica (upsert
 * no-op se já existe).
 */
export async function concederXp(ctx: ContextoEvento, quantidade: number) {
  const criado = await prisma.xpTransacao.upsert({
    where: { idempotencyKey: ctx.idempotencyKey },
    update: {},
    create: {
      empresaId: ctx.empresaId,
      lojaId: ctx.lojaId,
      vendedorId: ctx.vendedorId,
      tipoEvento: ctx.tipoEvento,
      quantidade,
      referenciaTipo: ctx.referenciaTipo,
      referenciaId: ctx.referenciaId,
      idempotencyKey: ctx.idempotencyKey,
      regraVersao: ctx.regraVersao,
      ocorridoEm: ctx.ocorridoEm,
    },
  });
  log.info({ vendedorId: ctx.vendedorId, tipoEvento: ctx.tipoEvento, quantidade }, 'XP concedido');
  return criado;
}

/**
 * Concede/debita VendaCoins. `valor` pode ser negativo (estorno/débito).
 * Idempotente do mesmo jeito que concederXp.
 */
export async function concederMoeda(ctx: ContextoEvento, valor: number) {
  const criado = await prisma.moedaTransacao.upsert({
    where: { idempotencyKey: ctx.idempotencyKey },
    update: {},
    create: {
      empresaId: ctx.empresaId,
      lojaId: ctx.lojaId,
      vendedorId: ctx.vendedorId,
      tipoEvento: ctx.tipoEvento,
      valor,
      referenciaTipo: ctx.referenciaTipo,
      referenciaId: ctx.referenciaId,
      idempotencyKey: ctx.idempotencyKey,
      regraVersao: ctx.regraVersao,
      ocorridoEm: ctx.ocorridoEm,
    },
  });
  log.info({ vendedorId: ctx.vendedorId, tipoEvento: ctx.tipoEvento, valor }, 'transação de moeda registrada');
  return criado;
}

/**
 * Reverte uma concessão de moeda anterior (ex.: resync do ERP derrubou o
 * faturamento do dia abaixo do tier que já tinha sido premiado). Gera uma
 * transação compensatória negativa referenciando a original — nunca edita
 * ou apaga a transação original (seção 15, "não apagar/corrigir por edição
 * silenciosa").
 *
 * Idempotente: se a reversão já foi feita para essa idempotencyKeyOriginal,
 * não duplica (a idempotencyKey da reversão é derivada da original).
 */
export async function reverterMoeda(idempotencyKeyOriginal: string, motivo: string) {
  const original = await prisma.moedaTransacao.findUnique({ where: { idempotencyKey: idempotencyKeyOriginal } });
  if (!original) return null; // nunca foi concedido — nada a reverter

  const idempotencyKeyReversao = `reversao-${idempotencyKeyOriginal}`;
  const jaRevertido = await prisma.moedaTransacao.findUnique({ where: { idempotencyKey: idempotencyKeyReversao } });
  if (jaRevertido) return jaRevertido; // já revertido — idempotente

  const reversao = await prisma.moedaTransacao.create({
    data: {
      empresaId: original.empresaId,
      lojaId: original.lojaId,
      vendedorId: original.vendedorId,
      tipoEvento: 'REVERSAO',
      valor: -original.valor,
      // Propaga o MESMO referenciaTipo/referenciaId da transação original (não
      // aponta pra si mesma) — quem calcula "saldo líquido de um evento" (ex.:
      // motor.service.ts ao decidir se um tier ainda está ativo) filtra por
      // referenciaTipo+referenciaId e precisa enxergar a reversão nessa soma.
      referenciaTipo: original.referenciaTipo,
      referenciaId: original.referenciaId,
      idempotencyKey: idempotencyKeyReversao,
      regraVersao: original.regraVersao,
      ocorridoEm: new Date(),
    },
  });

  log.warn({ vendedorId: original.vendedorId, idempotencyKeyOriginal, motivo }, 'moeda revertida');
  return reversao;
}

export async function getSaldoMoedas(vendedorId: string): Promise<number> {
  const resultado = await prisma.moedaTransacao.aggregate({
    where: { vendedorId },
    _sum: { valor: true },
  });
  return resultado._sum.valor ?? 0;
}

export async function getTotalXp(vendedorId: string): Promise<number> {
  const resultado = await prisma.xpTransacao.aggregate({
    where: { vendedorId },
    _sum: { quantidade: true },
  });
  return resultado._sum.quantidade ?? 0;
}
