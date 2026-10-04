/**
 * Métricas de ACESSO e ENGAJAMENTO para o painel (Admin/gerente) e para o
 * próprio vendedor. Só leitura; tudo calculado no servidor a partir de
 * AcessoDiario e EventoEngajamento, no fuso da empresa.
 *
 * Acesso mede ADOÇÃO. Engajamento mede USO RELEVANTE. Nenhum dos dois mede
 * desempenho comercial — e este serviço nunca os mistura com venda/meta.
 *
 * Escopo (quem pode ver o quê) é decidido na ROTA e chega aqui já resolvido
 * em `escopo` — este serviço nunca confia em empresa/loja vinda do cliente.
 */
import { TipoEventoEngajamento } from '@prisma/client';
import { prisma } from '../db';
import { obterConfigRecompensa, type ConfigRecompensa } from './config.service';
import { diaLocal, diasEntre, inicioDaSemana, listarDias, paraDate, somarDias } from './dia';
import { calcularFrequencia, calcularMaiorStreak, calcularStreakAtual, type Frequencia } from './regras';
import { diasComAcesso, JANELA_STREAK_DIAS } from './acesso.service';

export type Periodo = 'HOJE' | 'SEMANA_ATUAL' | 'ULTIMOS_7' | 'SEMANA_PASSADA' | 'ULTIMOS_30' | 'PERSONALIZADO';

export const MAXIMO_DIAS_PERSONALIZADO = 92;

export class PeriodoInvalidoError extends Error {}

export function resolverPeriodo(periodo: Periodo, hoje: string, de?: string, ate?: string): { inicio: string; fim: string } {
  switch (periodo) {
    case 'HOJE':
      return { inicio: hoje, fim: hoje };
    case 'SEMANA_ATUAL':
      return { inicio: inicioDaSemana(hoje), fim: hoje };
    case 'ULTIMOS_7':
      return { inicio: somarDias(hoje, -6), fim: hoje };
    case 'SEMANA_PASSADA': {
      const seg = somarDias(inicioDaSemana(hoje), -7);
      return { inicio: seg, fim: somarDias(seg, 6) };
    }
    case 'ULTIMOS_30':
      return { inicio: somarDias(hoje, -29), fim: hoje };
    case 'PERSONALIZADO': {
      if (!de || !ate || ate < de) throw new PeriodoInvalidoError('período personalizado exige início ≤ fim');
      if (diasEntre(de, ate) > MAXIMO_DIAS_PERSONALIZADO) throw new PeriodoInvalidoError(`período máximo de ${MAXIMO_DIAS_PERSONALIZADO} dias`);
      return { inicio: de, fim: ate > hoje ? hoje : ate };
    }
  }
}

export interface EscopoPainel {
  empresaId: string;
  /** null = todas as lojas da empresa (Admin). Gerente recebe só a(s) dele. */
  lojaIds: string[] | null;
}

export interface FiltrosPainel {
  periodo: Periodo;
  de?: string;
  ate?: string;
  lojaId?: string;
  vendedorId?: string;
}

const TIPOS_ENGAJAMENTO: TipoEventoEngajamento[] = ['MISSAO_CONCLUIDA', 'DESAFIO_CONCLUIDO', 'AULA_CONCLUIDA', 'QUIZ_APROVADO', 'SIMULACAO_CONCLUIDA'];

export interface LinhaVendedor {
  vendedorId: string;
  nome: string;
  lojaId: string;
  loja: string;
  acessouHoje: boolean;
  semana: Frequencia;
  periodo: Frequencia;
  streakAtual: number;
  ultimoAcessoEm: string | null;
  engajamento: Record<TipoEventoEngajamento, number>;
}

export async function montarPainel(escopo: EscopoPainel, filtros: FiltrosPainel, agora: Date = new Date()) {
  const empresa = await prisma.empresa.findUniqueOrThrow({ where: { id: escopo.empresaId }, select: { timezone: true } });
  const hoje = diaLocal(agora, empresa.timezone);
  const { inicio, fim } = resolverPeriodo(filtros.periodo, hoje, filtros.de, filtros.ate);
  const semanaInicio = inicioDaSemana(hoje);

  // Elegíveis: VENDEDOR ativo. Inativo, bloqueado, desligado ou ainda não
  // ativado não entra no denominador (histórico dele continua guardado).
  const lojasPermitidas = escopo.lojaIds;
  const lojaFiltro = filtros.lojaId ? [filtros.lojaId] : lojasPermitidas;
  const vendedores = await prisma.vendedor.findMany({
    where: {
      empresaId: escopo.empresaId,
      papel: 'VENDEDOR',
      status: 'ACTIVE',
      ...(lojaFiltro ? { lojaId: { in: lojaFiltro } } : {}),
      ...(filtros.vendedorId ? { id: filtros.vendedorId } : {}),
    },
    select: { id: true, nome: true, lojaId: true, createdAt: true, loja: { select: { nome: true } } },
    orderBy: { nome: 'asc' },
  });
  const ids = vendedores.map((v) => v.id);

  const desde = [inicio, somarDias(hoje, -JANELA_STREAK_DIAS)].sort()[0];
  const [mapaDias, ultimos, eventos, recompensasHoje] = await Promise.all([
    diasComAcesso(ids, desde, hoje > fim ? hoje : fim),
    prisma.acessoDiario.groupBy({ by: ['vendedorId'], where: { vendedorId: { in: ids } }, _max: { ultimoAcessoEm: true } }),
    prisma.eventoEngajamento.groupBy({ by: ['vendedorId', 'tipo'], where: { vendedorId: { in: ids }, dia: { gte: paraDate(inicio), lte: paraDate(fim) } }, _count: { _all: true } }),
    prisma.acessoDiario.count({ where: { vendedorId: { in: ids }, dia: paraDate(hoje), recompensaConcedida: true } }),
  ]);
  const ultimoPorVendedor = new Map(ultimos.map((u) => [u.vendedorId, u._max.ultimoAcessoEm]));

  const linhas: LinhaVendedor[] = vendedores.map((v) => {
    const dias = mapaDias.get(v.id)!;
    const elegivelDesde = diaLocal(v.createdAt, empresa.timezone);
    const engajamento = Object.fromEntries(TIPOS_ENGAJAMENTO.map((t) => [t, 0])) as Record<TipoEventoEngajamento, number>;
    for (const e of eventos.filter((x) => x.vendedorId === v.id)) engajamento[e.tipo] = e._count._all;
    return {
      vendedorId: v.id,
      nome: v.nome,
      lojaId: v.lojaId,
      loja: v.loja.nome,
      acessouHoje: dias.has(hoje),
      semana: calcularFrequencia({ diasComAcesso: dias, inicio: semanaInicio, fim: hoje, hoje, elegivelDesde }),
      periodo: calcularFrequencia({ diasComAcesso: dias, inicio, fim, hoje, elegivelDesde }),
      streakAtual: calcularStreakAtual(dias, hoje),
      ultimoAcessoEm: ultimoPorVendedor.get(v.id)?.toISOString() ?? null,
      engajamento,
    };
  });

  const total = linhas.length;
  const acessaramHoje = linhas.filter((l) => l.acessouHoje).length;
  const comAcessoNoPeriodo = linhas.filter((l) => l.periodo.diasComAcesso > 0).length;
  const comDiasValidos = linhas.filter((l) => l.periodo.diasValidos > 0);
  const media = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : 0);
  const maxValidos = Math.max(0, ...linhas.map((l) => l.periodo.diasValidos));
  const distribuicao = Array.from({ length: maxValidos + 1 }, (_, n) => ({ dias: n, vendedores: linhas.filter((l) => l.periodo.diasComAcesso === n).length }));
  const lider = [...linhas].sort((a, b) => b.streakAtual - a.streakAtual)[0];

  // Série diária (até 31 dias): quantos dos elegíveis acessaram em cada dia.
  const serieInicio = [inicio, somarDias(fim, -30)].sort().reverse()[0];
  const serie = listarDias(serieInicio, fim > hoje ? hoje : fim).map((dia) => {
    const elegiveisNoDia = vendedores.filter((v) => diaLocal(v.createdAt, empresa.timezone) <= dia);
    return { dia, acessaram: elegiveisNoDia.filter((v) => mapaDias.get(v.id)!.has(dia)).length, elegiveis: elegiveisNoDia.length };
  });

  // Comparação entre lojas (adesão no período = dias com acesso ÷ dias válidos).
  const lojas = new Map<string, { lojaId: string; loja: string; elegiveis: number; acessaramHoje: number; diasComAcesso: number; diasValidos: number }>();
  for (const l of linhas) {
    const atual = lojas.get(l.lojaId) ?? { lojaId: l.lojaId, loja: l.loja, elegiveis: 0, acessaramHoje: 0, diasComAcesso: 0, diasValidos: 0 };
    atual.elegiveis++;
    if (l.acessouHoje) atual.acessaramHoje++;
    atual.diasComAcesso += l.periodo.diasComAcesso;
    atual.diasValidos += l.periodo.diasValidos;
    lojas.set(l.lojaId, atual);
  }

  return {
    hoje,
    timezone: empresa.timezone,
    periodo: { tipo: filtros.periodo, inicio, fim },
    kpis: {
      hoje: { acessaram: acessaramHoje, elegiveis: total, percentual: total ? Math.round((acessaramHoje / total) * 100) : null, naoAcessaram: total - acessaramHoje, recompensasConcedidas: recompensasHoje },
      periodo: {
        acessaram: comAcessoNoPeriodo,
        elegiveis: total,
        percentual: total ? Math.round((comAcessoNoPeriodo / total) * 100) : null,
        semAcesso: total - comAcessoNoPeriodo,
        mediaDiasComAcesso: media(comDiasValidos.map((l) => l.periodo.diasComAcesso)),
        mediaDiasValidos: media(comDiasValidos.map((l) => l.periodo.diasValidos)),
        distribuicao,
      },
      maiorStreak: lider && lider.streakAtual > 0 ? { dias: lider.streakAtual, vendedor: lider.nome } : null,
    },
    serie,
    porLoja: [...lojas.values()].map((l) => ({ ...l, percentualPeriodo: l.diasValidos ? Math.round((l.diasComAcesso / l.diasValidos) * 100) : null })).sort((a, b) => (b.percentualPeriodo ?? -1) - (a.percentualPeriodo ?? -1)),
    vendedores: linhas,
  };
}

/** Visão do PRÓPRIO vendedor — sempre resolvida pelo id do token. */
export async function montarMeuEngajamento(vendedorId: string, agora: Date = new Date()): Promise<{
  hoje: string;
  acessouHoje: boolean;
  recompensaHoje: { xp: number; moedas: number } | null;
  config: ConfigRecompensa;
  streakAtual: number;
  maiorStreak: number;
  semana: Frequencia;
}> {
  const v = await prisma.vendedor.findUniqueOrThrow({ where: { id: vendedorId }, select: { empresaId: true, createdAt: true, loja: { select: { empresa: { select: { timezone: true } } } } } });
  const tz = v.loja.empresa.timezone;
  const hoje = diaLocal(agora, tz);
  const [mapa, acessoHoje, config] = await Promise.all([
    diasComAcesso([vendedorId], somarDias(hoje, -JANELA_STREAK_DIAS), hoje),
    prisma.acessoDiario.findUnique({ where: { vendedorId_dia: { vendedorId, dia: paraDate(hoje) } } }),
    obterConfigRecompensa(v.empresaId),
  ]);
  const dias = mapa.get(vendedorId)!;
  return {
    hoje,
    acessouHoje: Boolean(acessoHoje),
    recompensaHoje: acessoHoje?.recompensaConcedida ? { xp: acessoHoje.xpConcedido, moedas: acessoHoje.moedasConcedidas } : null,
    config,
    streakAtual: calcularStreakAtual(dias, hoje),
    maiorStreak: calcularMaiorStreak(dias),
    semana: calcularFrequencia({ diasComAcesso: dias, inicio: inicioDaSemana(hoje), fim: hoje, hoje, elegivelDesde: diaLocal(v.createdAt, tz) }),
  };
}

