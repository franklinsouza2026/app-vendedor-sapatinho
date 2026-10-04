/**
 * Registro do ACESSO diário e concessão do CHECK-IN (recompensa pelo
 * primeiro acesso do dia).
 *
 * Garantia "no máximo 1 recompensa por vendedor por dia" está no BANCO:
 *  1. `INSERT … ON CONFLICT ("vendedorId", dia) DO UPDATE … RETURNING (xmax = 0)`
 *     é atômico. Entre N requisições simultâneas (refresh, outra aba, outro
 *     aparelho, logout/login), só UMA insere a linha do dia; as demais esperam
 *     o lock do índice único e caem no UPDATE (só último acesso/contador).
 *  2. Só a requisição que inseriu concede XP/VendaCoins, na MESMA transação,
 *     com `idempotencyKey` única nos ledgers (segunda barreira).
 * O dia é calculado no servidor, no fuso da empresa. Nada vem do cliente.
 */
import { randomUUID } from 'node:crypto';
import { prisma } from '../db';
import { createLogger } from '../utils/logger';
import { obterConfigRecompensa, type ConfigRecompensa } from './config.service';
import { deDate, diaLocal, paraDate, somarDias } from './dia';
import { calcularStreakAtual } from './regras';

const log = createLogger('engajamento:acesso');

export class AcessoNaoPermitidoError extends Error {}

export interface ResultadoAcesso {
  dia: string;
  /** true só na requisição que registrou o primeiro acesso do dia. */
  primeiroAcessoDoDia: boolean;
  /** Recompensa concedida AGORA (só no primeiro acesso, com recompensa ativa). */
  recompensaAgora: { xp: number; moedas: number } | null;
  /** O acesso de hoje está reconhecido (sempre true depois deste registro). */
  checkinConcluido: boolean;
  /** O que foi concedido hoje pelo check-in (agora ou antes). */
  recompensaHoje: { xp: number; moedas: number } | null;
  quantidadeAcessosHoje: number;
  streakAcesso: number;
  config: ConfigRecompensa;
}

export function chaveIdempotenciaCheckin(vendedorId: string, dia: string): string {
  return `acesso-diario:${vendedorId}:${dia}`;
}

export async function registrarAcesso(vendedorId: string, agora: Date = new Date(), origem = 'APP_ABERTO'): Promise<ResultadoAcesso> {
  const vendedor = await prisma.vendedor.findUnique({ where: { id: vendedorId }, select: { id: true, empresaId: true, lojaId: true, papel: true, status: true, loja: { select: { empresa: { select: { timezone: true } } } } } });
  // Acesso só conta para VENDEDOR ativo — métrica de adoção do app de venda.
  if (!vendedor || vendedor.status !== 'ACTIVE' || vendedor.papel !== 'VENDEDOR') throw new AcessoNaoPermitidoError('acesso só é registrado para vendedor ativo');

  const timezone = vendedor.loja.empresa.timezone;
  const dia = diaLocal(agora, timezone);
  const config = await obterConfigRecompensa(vendedor.empresaId);

  const resultado = await prisma.$transaction(async (tx) => {
    const linhas = await tx.$queryRaw<{ id: string; inserido: boolean; quantidadeAcessos: number; recompensaConcedida: boolean; xpConcedido: number; moedasConcedidas: number }[]>`
      INSERT INTO acesso_diario (id, "empresaId", "lojaId", "vendedorId", dia, "primeiroAcessoEm", "ultimoAcessoEm", "quantidadeAcessos", origem)
      VALUES (${randomUUID()}, ${vendedor.empresaId}, ${vendedor.lojaId}, ${vendedor.id}, ${paraDate(dia)}::date, ${agora}, ${agora}, 1, ${origem})
      ON CONFLICT ("vendedorId", dia) DO UPDATE
        SET "ultimoAcessoEm" = GREATEST(acesso_diario."ultimoAcessoEm", EXCLUDED."ultimoAcessoEm"),
            "quantidadeAcessos" = acesso_diario."quantidadeAcessos" + 1
      RETURNING id, (xmax = 0) AS inserido, "quantidadeAcessos", "recompensaConcedida", "xpConcedido", "moedasConcedidas"`;
    const linha = linhas[0];

    let recompensaAgora: { xp: number; moedas: number } | null = null;
    if (linha.inserido && config.ativo && (config.xp > 0 || config.moedas > 0)) {
      const chave = chaveIdempotenciaCheckin(vendedor.id, dia);
      const base = { empresaId: vendedor.empresaId, lojaId: vendedor.lojaId, vendedorId: vendedor.id, tipoEvento: 'ACESSO_DIARIO' as const, referenciaTipo: 'ACESSO_DIARIO', referenciaId: linha.id, idempotencyKey: chave, regraVersao: 0, ocorridoEm: agora };
      if (config.xp > 0) await tx.xpTransacao.create({ data: { ...base, quantidade: config.xp } });
      if (config.moedas > 0) await tx.moedaTransacao.create({ data: { ...base, valor: config.moedas } });
      await tx.acessoDiario.update({ where: { id: linha.id }, data: { recompensaConcedida: true, xpConcedido: config.xp, moedasConcedidas: config.moedas } });
      recompensaAgora = { xp: config.xp, moedas: config.moedas };
    }

    return {
      inserido: linha.inserido,
      quantidadeAcessos: linha.quantidadeAcessos,
      recompensaAgora,
      recompensaHoje: recompensaAgora ?? (linha.recompensaConcedida ? { xp: linha.xpConcedido, moedas: linha.moedasConcedidas } : null),
    };
  });

  const streakAcesso = await streakAtualDoVendedor(vendedor.id, dia);
  if (resultado.inserido) log.info({ vendedorId, dia, recompensa: resultado.recompensaAgora }, 'primeiro acesso do dia registrado');

  return {
    dia,
    primeiroAcessoDoDia: resultado.inserido,
    recompensaAgora: resultado.recompensaAgora,
    checkinConcluido: true,
    recompensaHoje: resultado.recompensaHoje,
    quantidadeAcessosHoje: resultado.quantidadeAcessos,
    streakAcesso,
    config,
  };
}

/** Janela máxima olhada para trás no cálculo da sequência (≈ 13 meses). */
export const JANELA_STREAK_DIAS = 400;

export async function diasComAcesso(vendedorIds: string[], desde: string, ate: string): Promise<Map<string, Set<string>>> {
  const linhas = await prisma.acessoDiario.findMany({ where: { vendedorId: { in: vendedorIds }, dia: { gte: paraDate(desde), lte: paraDate(ate) } }, select: { vendedorId: true, dia: true } });
  const mapa = new Map<string, Set<string>>();
  for (const id of vendedorIds) mapa.set(id, new Set());
  for (const l of linhas) mapa.get(l.vendedorId)!.add(deDate(l.dia));
  return mapa;
}

export async function streakAtualDoVendedor(vendedorId: string, hoje: string): Promise<number> {
  const dias = (await diasComAcesso([vendedorId], somarDias(hoje, -JANELA_STREAK_DIAS), hoje)).get(vendedorId)!;
  return calcularStreakAtual(dias, hoje);
}
