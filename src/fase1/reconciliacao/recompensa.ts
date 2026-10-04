// Reconciliação de recompensa (D4, T4) — a ÚNICA forma de conceder ou desfazer
// XP/VendaCoins ligados a um fato comercial (meta do dia, sequência, missão,
// prêmio). Recebe o ESTADO DEVIDO, calculado dos fatos, e ajusta o ledger:
//
//   devida + saldo líquido da referência = 0  → concede nova geração (…-gN)
//   não devida + saldo líquido > 0            → estorno compensatório (REVERSAO)
//   já no estado devido                       → nada (idempotente)
//
// Nunca edita nem apaga transação: o histórico mostra crédito, estorno e
// recrédito. Cancelamento repetido não gera segundo estorno (o saldo já é 0).
// Chamado dentro da transação com trava por vendedor (motor.ts) — duas
// reconciliações simultâneas do mesmo vendedor nunca se cruzam.
import { Prisma, TipoEventoGamificacao } from '@prisma/client';

export type ClienteDb = Prisma.TransactionClient;

export interface AlvoRecompensa {
  empresaId: string;
  lojaId: string;
  vendedorId: string;
  tipoEvento: TipoEventoGamificacao;
  referenciaTipo: string;
  referenciaId: string;
  /** Prefixo estável da chave de idempotência; a geração é sufixada (-g0, -g1…). */
  prefixoChave: string;
  regraVersao: number;
  ocorridoEm: Date;
}

export type DesfechoRecompensa = 'CONCEDIDA' | 'REVERTIDA' | 'MANTIDA';

export async function saldoDaReferencia(db: ClienteDb, vendedorId: string, referenciaTipo: string, referenciaId: string) {
  const [xps, moedas] = await Promise.all([
    db.xpTransacao.findMany({ where: { vendedorId, referenciaTipo, referenciaId }, orderBy: { createdAt: 'asc' }, select: { quantidade: true, idempotencyKey: true } }),
    db.moedaTransacao.findMany({ where: { vendedorId, referenciaTipo, referenciaId }, orderBy: { createdAt: 'asc' }, select: { valor: true, idempotencyKey: true } }),
  ]);
  const xp = xps.reduce((a, t) => a + t.quantidade, 0);
  const moeda = moedas.reduce((a, t) => a + t.valor, 0);
  const chavesCredito = [...new Set([...xps.filter((t) => t.quantidade > 0).map((t) => t.idempotencyKey), ...moedas.filter((t) => t.valor > 0).map((t) => t.idempotencyKey)])];
  const chavesUsadas = new Set([...xps.map((t) => t.idempotencyKey), ...moedas.map((t) => t.idempotencyKey)]);
  return { xp, moeda, chavesCredito, chavesUsadas };
}

export async function reconciliarRecompensa(db: ClienteDb, alvo: AlvoRecompensa, devida: boolean, valores: { xp: number; moedas: number }): Promise<DesfechoRecompensa> {
  const saldo = await saldoDaReferencia(db, alvo.vendedorId, alvo.referenciaTipo, alvo.referenciaId);
  const ativo = saldo.xp > 0 || saldo.moeda > 0;
  const base = { empresaId: alvo.empresaId, lojaId: alvo.lojaId, vendedorId: alvo.vendedorId, referenciaTipo: alvo.referenciaTipo, referenciaId: alvo.referenciaId, regraVersao: alvo.regraVersao };

  if (devida && !ativo) {
    if (valores.xp <= 0 && valores.moedas <= 0) return 'MANTIDA';
    let geracao = saldo.chavesCredito.length;
    let chave = `${alvo.prefixoChave}-g${geracao}`;
    while (saldo.chavesUsadas.has(chave)) chave = `${alvo.prefixoChave}-g${++geracao}`;
    if (valores.xp > 0) await db.xpTransacao.createMany({ data: [{ ...base, tipoEvento: alvo.tipoEvento, quantidade: valores.xp, idempotencyKey: chave, ocorridoEm: alvo.ocorridoEm }], skipDuplicates: true });
    if (valores.moedas > 0) await db.moedaTransacao.createMany({ data: [{ ...base, tipoEvento: alvo.tipoEvento, valor: valores.moedas, idempotencyKey: chave, ocorridoEm: alvo.ocorridoEm }], skipDuplicates: true });
    return 'CONCEDIDA';
  }

  if (!devida && ativo) {
    const ultimoCredito = saldo.chavesCredito[saldo.chavesCredito.length - 1] ?? alvo.prefixoChave;
    let chave = `reversao-${ultimoCredito}`;
    let n = 1;
    while (saldo.chavesUsadas.has(chave)) chave = `reversao-${ultimoCredito}-${n++}`;
    const agora = new Date();
    if (saldo.xp > 0) await db.xpTransacao.createMany({ data: [{ ...base, tipoEvento: 'REVERSAO', quantidade: -saldo.xp, idempotencyKey: chave, ocorridoEm: agora }], skipDuplicates: true });
    if (saldo.moeda > 0) await db.moedaTransacao.createMany({ data: [{ ...base, tipoEvento: 'REVERSAO', valor: -saldo.moeda, idempotencyKey: chave, ocorridoEm: agora }], skipDuplicates: true });
    return 'REVERTIDA';
  }

  return 'MANTIDA';
}
