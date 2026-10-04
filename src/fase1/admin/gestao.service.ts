// Ações de gestão do Admin na Fase 1: elegibilidade, ajuste compensatório no
// ledger e reconhecimento. Tudo auditado; nada edita saldo diretamente.
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../../db';
import { registrarEventoAuditoria } from '../../identidade/auditoria.service';
import { registrarReconhecimento } from '../../competicoes/recognition.service';
import { invalido, naoEncontrado } from '../../utils/erro-http';

async function vendedorDaEmpresa(empresaId: string, vendedorId: string) {
  const v = await prisma.vendedor.findFirst({ where: { id: vendedorId, empresaId } });
  if (!v) throw naoEncontrado('vendedor');
  return v;
}

export const elegibilidadeSchema = z.object({ elegivel: z.boolean(), motivo: z.string().trim().max(300).nullable() });

export async function definirElegibilidade(empresaId: string, atorId: string, vendedorId: string, entrada: unknown) {
  const { elegivel, motivo } = elegibilidadeSchema.parse(entrada);
  if (!elegivel && (!motivo || motivo.length < 5)) throw invalido('Tirar alguém do ranking exige motivo (mínimo 5 caracteres) — fica na auditoria.');
  const v = await vendedorDaEmpresa(empresaId, vendedorId);
  await prisma.vendedor.update({ where: { id: vendedorId }, data: { elegivelRanking: elegivel, motivoInelegivel: elegivel ? null : motivo } });
  await registrarEventoAuditoria({ empresaId, acao: 'ELIGIBILITY_CHANGED', actorId: atorId, targetId: vendedorId, metadata: { antes: v.elegivelRanking, depois: elegivel, motivo: elegivel ? null : motivo } });
  return { vendedorId, elegivel, motivo: elegivel ? null : motivo };
}

/**
 * Ajuste do Admin (XP e/ou VendaCoins) — LANÇAMENTO COMPENSATÓRIO, nunca
 * edição de saldo: uma linha nova no ledger (AJUSTE_MANUAL) com motivo, autor
 * e data, auditada. `idempotencyKey` vem do cliente (uuid por envio) só para
 * que duplo clique/reenvio não lance duas vezes — o valor é validado aqui.
 */
export const ajusteSchema = z
  .object({
    vendedorId: z.string().uuid(),
    xp: z.number().int().min(-1000).max(1000).default(0),
    moedas: z.number().int().min(-1000).max(1000).default(0),
    motivo: z.string().trim().min(10).max(300),
    chave: z.string().uuid(),
  })
  .refine((a) => a.xp !== 0 || a.moedas !== 0, { message: 'Informe XP ou VendaCoins diferente de zero.' });

export async function lancarAjuste(empresaId: string, atorId: string, entrada: unknown) {
  const a = ajusteSchema.parse(entrada);
  const v = await vendedorDaEmpresa(empresaId, a.vendedorId);
  const idempotencyKey = `ajuste-${a.chave}`;
  const base = { empresaId, lojaId: v.lojaId, vendedorId: v.id, tipoEvento: 'AJUSTE_MANUAL' as const, referenciaTipo: 'AJUSTE_ADMIN', referenciaId: a.motivo, idempotencyKey, regraVersao: 0, ocorridoEm: new Date() };
  if (a.moedas < 0) {
    const saldo = (await prisma.moedaTransacao.aggregate({ where: { vendedorId: v.id }, _sum: { valor: true } }))._sum.valor ?? 0;
    if (saldo + a.moedas < 0) throw invalido('O ajuste deixaria o saldo de VendaCoins negativo.');
  }
  const [xp, moedas] = await prisma.$transaction([
    a.xp !== 0 ? prisma.xpTransacao.createMany({ data: [{ ...base, quantidade: a.xp }], skipDuplicates: true }) : prisma.xpTransacao.createMany({ data: [] }),
    a.moedas !== 0 ? prisma.moedaTransacao.createMany({ data: [{ ...base, valor: a.moedas }], skipDuplicates: true }) : prisma.moedaTransacao.createMany({ data: [] }),
  ]);
  const lancou = xp.count + moedas.count > 0;
  if (lancou) await registrarEventoAuditoria({ empresaId, acao: 'LEDGER_ADJUSTMENT', actorId: atorId, targetId: v.id, metadata: { xp: a.xp, moedas: a.moedas, motivo: a.motivo, idempotencyKey } });
  return { lancado: lancou, duplicado: !lancou };
}

const MOTIVO_PARA_TIPO = { RESULTADO: 'PERFORMANCE', EVOLUCAO: 'EVOLUTION', INICIATIVA: 'INITIATIVE', EQUIPE: 'TEAMWORK', SUPERACAO: 'OVERCOMING', OUTRO: 'CUSTOM' } as const;

export const reconhecimentoSchema = z.object({
  vendedorId: z.string().uuid(),
  motivo: z.enum(['RESULTADO', 'EVOLUCAO', 'INICIATIVA', 'EQUIPE', 'SUPERACAO', 'OUTRO']),
  titulo: z.string().trim().min(3).max(120),
  mensagem: z.string().trim().min(5).max(500),
});

export async function reconhecer(empresaId: string, atorId: string, entrada: unknown) {
  const r = reconhecimentoSchema.parse(entrada);
  const v = await vendedorDaEmpresa(empresaId, r.vendedorId);
  if (v.status !== 'ACTIVE') throw invalido('Só vendedor ativo pode ser reconhecido.');
  return registrarReconhecimento({ empresaId, authorId: atorId, subjectId: v.id, tipo: MOTIVO_PARA_TIPO[r.motivo], titulo: r.titulo, message: r.mensagem, lojaId: v.lojaId });
}

export { randomUUID };
