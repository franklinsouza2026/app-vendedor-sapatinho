// Premiações — DIGITAL (XP/VendaCoins/badge, entra pelo ledger oficial) ou
// EMPRESARIAL (registro informativo: o sistema nunca paga nada). Usadas por
// missões, competições e frentes de campanha.
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db';
import { registrarEventoAuditoria } from '../../identidade/auditoria.service';
import { invalido, naoEncontrado } from '../../utils/erro-http';

export const LIMITE_RECOMPENSA = 1000;

export const premioSchema = z
  .object({
    nome: z.string().trim().min(3).max(120),
    tipo: z.enum(['DIGITAL', 'EMPRESARIAL']),
    xp: z.number().int().min(0).max(LIMITE_RECOMPENSA).default(0),
    moedas: z.number().int().min(0).max(LIMITE_RECOMPENSA).default(0),
    comBadge: z.boolean().default(false),
    categoria: z.enum(['DINHEIRO', 'VALE', 'PRODUTO', 'EXPERIENCIA', 'OUTRO']).nullable().default(null),
    descricao: z.string().trim().max(500).default(''),
  })
  .superRefine((p, ctx) => {
    if (p.tipo === 'DIGITAL' && !p.xp && !p.moedas && !p.comBadge) ctx.addIssue({ code: 'custom', message: 'Recompensa digital precisa de XP, VendaCoins ou badge.' });
    if (p.tipo === 'EMPRESARIAL' && !p.categoria) ctx.addIssue({ code: 'custom', message: 'Escolha a categoria do prêmio empresarial.' });
  });

export function serializarPremio(p: Prisma.PremioGetPayload<object>) {
  return { id: p.id, nome: p.nome, tipo: p.tipo, xp: p.xp, moedas: p.moedas, badge: p.badgeCodigo, categoria: p.categoria, descricao: p.descricao, ativo: p.ativo };
}

/** Texto do prêmio para o vendedor (mesma regra do protótipo homologado). */
export function descreverPremio(p: { tipo: string; nome: string; xp: number; moedas: number; badgeCodigo?: string | null; badge?: string | null }): string {
  if (p.tipo === 'EMPRESARIAL') return p.nome;
  const temBadge = Boolean(p.badgeCodigo ?? p.badge);
  const partes = [p.xp ? `+${p.xp} XP` : '', p.moedas ? `+${p.moedas} VendaCoins` : '', temBadge ? `badge “${p.nome}”` : ''].filter(Boolean);
  return partes.join(' · ') || p.nome;
}

export async function listarPremios(empresaId: string) {
  return (await prisma.premio.findMany({ where: { empresaId }, orderBy: { createdAt: 'asc' } })).map(serializarPremio);
}

export async function premiosDaEmpresa(empresaId: string, ids: string[]) {
  if (!ids.length) return [];
  const premios = await prisma.premio.findMany({ where: { empresaId, id: { in: ids } } });
  if (premios.length !== new Set(ids).size) throw invalido('Prêmio inexistente ou de outra empresa.');
  return premios;
}

export async function criarPremio(empresaId: string, atorId: string, entrada: unknown) {
  const dados = premioSchema.parse(entrada);
  const premio = await prisma.$transaction(async (tx) => {
    const criado = await tx.premio.create({ data: { empresaId, nome: dados.nome, tipo: dados.tipo, xp: dados.tipo === 'DIGITAL' ? dados.xp : 0, moedas: dados.tipo === 'DIGITAL' ? dados.moedas : 0, categoria: dados.tipo === 'EMPRESARIAL' ? dados.categoria : null, descricao: dados.descricao, criadoPor: atorId } });
    if (dados.tipo === 'DIGITAL' && dados.comBadge) {
      // Badge próprio do prêmio — entra no catálogo de badges como qualquer outro.
      const codigo = `PREMIO_${criado.id.replace(/-/g, '').slice(0, 16).toUpperCase()}`;
      await tx.badge.create({ data: { codigo, titulo: dados.nome, descricao: dados.descricao || `Prêmio “${dados.nome}”`, categoria: 'PREMIO' } });
      return tx.premio.update({ where: { id: criado.id }, data: { badgeCodigo: codigo } });
    }
    return criado;
  });
  await registrarEventoAuditoria({ empresaId, acao: 'PRIZE_CREATED', actorId: atorId, metadata: { premioId: premio.id, nome: premio.nome, tipo: premio.tipo, xp: premio.xp, moedas: premio.moedas } });
  return serializarPremio(premio);
}

export async function buscarPremio(empresaId: string, id: string) {
  const p = await prisma.premio.findFirst({ where: { id, empresaId } });
  if (!p) throw naoEncontrado('prêmio');
  return p;
}
