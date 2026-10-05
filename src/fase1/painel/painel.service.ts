// Painel do vendedor (Fase 1) — monta, NO SERVIDOR, exatamente o contrato
// `Fase1Dados` que as telas homologadas consomem (web/src/fase1/dominio/
// tipos.ts). Tudo vem de dado real: vendas (via ERP Adapter), metas derivadas,
// ledgers, ranking D9, missões/competições/campanhas, feed e reconhecimentos.
// Nenhum valor que decida posição, prêmio ou recompensa é calculado no app.
import { calcularPa } from '../indicadores/pa';
import { prisma } from '../../db';
import { diaLocal, mesLocal, primeiroDiaDoMes } from '../../tempo/dia';
import { timezoneDaEmpresa } from '../../tempo/empresa';
import { listarFeed } from '../../competicoes/feed.service';
import { calcularDiasRestantes } from '../metas.service';
import { obterConfigFase1, Metrica } from '../config.service';
import { rankingLojas, rankingsPorMetrica, valorDaMetrica, visaoRankingEmpresa } from '../ranking/ranking.service';
import { fecharRankingDoMes } from '../ranking/fechamento-mensal.service';
import { missoesDoVendedor } from '../missoes/missoes.service';
import { competicoesDoVendedor } from '../competicoes/competicoes.service';
import { campanhasDoVendedor } from '../campanhas/campanhas.service';
import { frescorParaLoja } from '../integracoes/saude.service';
import { calcularSequencia, serieDoVendedor } from '../reconciliacao/motor';
import { extratoDoVendedor } from './extrato.service';
import { conquistasDoVendedor } from './conquistas.service';
import { historicoMensal, recordesDoVendedor } from './recordes.service';
import { somarDias, mesAnterior } from '../../tempo/dia';
import { calcularNivel, detalharNivel } from '../../gamificacao/niveis';

const TIPO_FEED: Record<string, { tipo: string; icone: string }> = {
  GOAL_REACHED: { tipo: 'META', icone: '🎯' },
  BADGE_EARNED: { tipo: 'CONQUISTA', icone: '🏅' },
  MISSION_COMPLETED: { tipo: 'MISSAO', icone: '✅' },
  COMPETITION_WON: { tipo: 'COMPETICAO', icone: '🏆' },
  COMPETITION_STARTED: { tipo: 'COMPETICAO', icone: '🏁' },
  CAMPAIGN_FINISHED: { tipo: 'COMPETICAO', icone: '📣' },
  RECOGNITION_RECEIVED: { tipo: 'RECONHECIMENTO', icone: '💛' },
  RECORD_BROKEN: { tipo: 'RECORDE', icone: '🚀' },
  RANK_UP: { tipo: 'POSICAO', icone: '⬆️' },
  STORE_LEAD: { tipo: 'LOJA', icone: '🏬' },
};

const MOTIVO_RECONHECIMENTO: Record<string, string> = { PERFORMANCE: 'RESULTADO', EVOLUTION: 'EVOLUCAO', INITIATIVE: 'INICIATIVA', TEAMWORK: 'EQUIPE', OVERCOMING: 'SUPERACAO' };

const INDICADOR_DA_METRICA: Record<Metrica, string> = { SCORE: 'SCORE', VENDAS: 'VENDAS', PERCENTUAL_META: 'PERCENTUAL_META', EVOLUCAO: 'EVOLUCAO', PA: 'PA', TICKET: 'TICKET', CONSISTENCIA: 'CONSISTENCIA' };

function realizado(t: { faturamento: number; vendas: number; pecas: number; pares: number }) {
  // D12: PA = peças por atendimento (`pares` segue disponível como dado físico de calçado).
  return { faturamento: t.faturamento, vendas: t.vendas, pecas: t.pecas, pares: t.pares, ticketMedio: t.vendas > 0 ? Math.round((t.faturamento / t.vendas) * 100) / 100 : null, pa: calcularPa(t.pecas, t.vendas) };
}

export async function montarPainel(vendedorId: string, agora = new Date()) {
  const vendedor = await prisma.vendedor.findUniqueOrThrow({ where: { id: vendedorId }, include: { loja: true } });
  const empresa = await prisma.empresa.findUniqueOrThrow({ where: { id: vendedor.empresaId } });
  const tz = await timezoneDaEmpresa(vendedor.empresaId);
  const hoje = diaLocal(agora, tz);
  const mes = mesLocal(agora, tz);

  // Fecha o mês anterior se ainda não fechado (histórico de posição) — idempotente.
  if (hoje >= primeiroDiaDoMes(mes)) await fecharRankingDoMes(vendedor.empresaId, mesAnterior(mes)).catch(() => undefined);

  const [visao, config, lojas, extrato, frescor] = await Promise.all([
    visaoRankingEmpresa(vendedor.empresaId, agora),
    obterConfigFase1(vendedor.empresaId),
    prisma.loja.findMany({ where: { empresaId: vendedor.empresaId, ativa: true }, select: { id: true, nome: true }, orderBy: { nome: 'asc' } }),
    extratoDoVendedor(vendedorId),
    frescorParaLoja(vendedor.empresaId, vendedor.lojaId, agora),
  ]);

  // Estatística própria (inclusive se inelegível ao ranking: o vendedor sempre vê o próprio desempenho).
  let eu = visao.agora.get(vendedorId);
  if (!eu) {
    const { estatisticasDoMes } = await import('../ranking/estatisticas.service');
    const regra = await prisma.regraGamificacaoVersao.findFirst({ where: { empresaId: vendedor.empresaId, ativo: true }, orderBy: { versao: 'desc' } });
    const pesos = (regra?.pesosScore as never) ?? { meta: 0.4, evolucao: 0.2, pa: 0.15, ticket: 0.15, consistencia: 0.1 };
    eu = (await estatisticasDoMes({ empresaId: vendedor.empresaId, vendedorIds: [vendedorId], mes, ateDia: hoje, hoje, tz, pesos })).get(vendedorId)!;
  }

  const elegiveisIds = visao.elegiveis.map((v) => v.id);
  const daLoja = visao.elegiveis.filter((v) => v.lojaId === vendedor.lojaId).map((v) => v.id);
  const indicadores = config.indicadores;
  const metricas = config.metricasRanking.filter((m) => indicadores[INDICADOR_DA_METRICA[m] as keyof typeof indicadores]);

  const serie = await serieDoVendedor(vendedorId, somarDias(hoje, -120), hoje, tz);
  const sequencia = calcularSequencia(serie, hoje);
  const trabalhadosAteOntem = serie.filter((d) => d.dia < hoje && d.dia >= primeiroDiaDoMes(mes) && d.vendas > 0).length;

  const [missoes, competicoes, recordes, historico, reconhecimentos, feedBruto] = await Promise.all([
    missoesDoVendedor(vendedorId, vendedor.empresaId, vendedor.lojaId, agora),
    competicoesDoVendedor(vendedor.empresaId, vendedorId, vendedor.lojaId, agora),
    recordesDoVendedor(vendedorId, tz, agora),
    historicoMensal(vendedorId, tz, agora),
    prisma.recognition.findMany({ where: { subjectId: vendedorId, empresaId: vendedor.empresaId }, orderBy: { createdAt: 'desc' }, take: 30 }),
    listarFeed(vendedor.empresaId, vendedor.lojaId, { limite: 40 }),
  ]);
  const campanhas = await campanhasDoVendedor(vendedor.empresaId, vendedorId, vendedor.lojaId, { competicoes: competicoes.map((c) => ({ id: c.id, tipo: c.tipo, participantes: c.participantes, meuId: c.meuId })), missoes }, agora);

  const autores = await prisma.vendedor.findMany({ where: { id: { in: reconhecimentos.map((r) => r.authorId) } }, select: { id: true, nome: true, papel: true } });
  const conquistas = await conquistasDoVendedor(vendedorId, { sequenciaAtual: sequencia.atual, hojeMeta: eu.metaDiaria, hojeFaturamento: eu.hoje.faturamento });

  const feed = feedBruto.eventos
    .map((e) => {
      const t = TIPO_FEED[e.eventType];
      if (!t || !config.feedTipos[t.tipo as keyof typeof config.feedTipos]) return null;
      const meu = e.subjectId === vendedorId || (t.tipo === 'LOJA' && e.lojaId === vendedor.lojaId);
      const sujeito = e.subjectId === vendedorId ? 'Você' : e.subjectNome ? e.subjectNome.split(' ')[0] : null;
      const texto = sujeito ? `${sujeito} ${e.mensagem.charAt(0).toLowerCase()}${e.mensagem.slice(1)}` : e.mensagem;
      return { id: e.id, tipo: t.tipo, quando: e.createdAt.toISOString(), icone: t.icone, texto: texto.replace(/^Você recebeu/, 'Você recebeu'), meu };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // Celebrações: créditos recentes do próprio ledger (o app lembra quais já mostrou).
  const desde = new Date(agora.getTime() - 48 * 3600 * 1000);
  const naJanela = extrato.xp.historico.filter((h) => new Date(h.quando) >= desde);
  // Crédito já estornado (cancelamento/devolução — D4) nunca vira celebração:
  // o estorno usa a chave `reversao-<chave do crédito>` (com sufixo -N se repetir).
  const estornos = naJanela.filter((h) => h.id.startsWith('xp:reversao-')).map((h) => h.id.slice('xp:reversao-'.length));
  const foiEstornado = (id: string) => {
    const chave = id.slice('xp:'.length);
    return estornos.some((e) => e === chave || (e.startsWith(`${chave}-`) && /^\d+$/.test(e.slice(chave.length + 1))));
  };
  const recentes = naJanela.filter((h) => h.xp > 0 && !foiEstornado(h.id));
  const celebracoes = recentes
    .filter((h) => /Meta diária atingida|Missão|Prêmio|Sequência/.test(h.origem))
    .slice(0, 3)
    .map((h) => ({
      id: h.id,
      tipo: h.origem.startsWith('Meta') ? 'META_DIA' : h.origem.startsWith('Missão') ? 'MISSAO' : 'MOEDAS',
      titulo: h.origem.startsWith('Meta') ? 'Meta de hoje batida!' : h.origem.startsWith('Missão') ? 'Missão concluída!' : 'Você ganhou!',
      detalhe: h.origem,
      recompensa: { xp: h.xp, moedas: extrato.moedas.historico.find((m) => m.id.replace('m:', '') === h.id.replace('xp:', ''))?.valor ?? 0 },
    }));
  const nivelAgora = calcularNivel(extrato.xp.total);
  const nivelAntes = calcularNivel(extrato.xp.total - naJanela.reduce((a, h) => a + h.xp, 0)); // variação LÍQUIDA (estornos inclusos)
  if (nivelAgora.nome !== nivelAntes.nome) celebracoes.unshift({ id: `nivel:${nivelAgora.nome}`, tipo: 'NIVEL', titulo: `Nível ${nivelAgora.nome}!`, detalhe: 'Você subiu de nível com o XP das suas vendas.', recompensa: { xp: 0, moedas: 0 } });

  const admitidoEm = (vendedor.admitidoEm ?? vendedor.createdAt).toISOString().slice(0, 10);
  const elegivel = vendedor.status === 'ACTIVE' && vendedor.elegivelRanking;
  const outros = visao.elegiveis.filter((v) => v.lojaId === vendedor.lojaId && v.id !== vendedorId).map((v) => visao.agora.get(v.id)!).filter(Boolean);
  const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  let referencia: { ticketMedio: number | null; pa: number | null; origem: 'MES' | 'LOJA' | null } =
    eu.mes.vendas > 0
      ? { ticketMedio: eu.ticket, pa: eu.pa, origem: 'MES' }
      : outros.some((o) => o.ticket !== null)
        ? { ticketMedio: media(outros.map((o) => o.ticket).filter((x): x is number => x !== null)), pa: media(outros.map((o) => o.pa).filter((x): x is number => x !== null)), origem: 'LOJA' }
        : { ticketMedio: null, pa: null, origem: null };
  if (!indicadores.TICKET) referencia = { ...referencia, ticketMedio: null };
  if (!indicadores.PA) referencia = { ...referencia, pa: null };

  // Médias para "Você × média" — no servidor. Métrica financeira só com ≥ 3
  // colegas no grupo: com menos, a média revelaria o valor de quem está ao lado.
  const METRICAS_TODAS: Metrica[] = ['SCORE', 'VENDAS', 'PERCENTUAL_META', 'EVOLUCAO', 'PA', 'TICKET', 'CONSISTENCIA'];
  const FINANCEIRA: Partial<Record<Metrica, boolean>> = { VENDAS: true, TICKET: true };
  const mediaDe = (ids: string[], m: Metrica) => {
    const valores = ids.map((id) => visao.agora.get(id)).filter(Boolean).map((e) => valorDaMetrica(e!, m)).filter((v): v is number => v !== null);
    const colegas = ids.filter((id) => id !== vendedorId).length;
    if (!valores.length || (FINANCEIRA[m] && colegas < 3)) return null;
    return Math.round((valores.reduce((a, b) => a + b, 0) / valores.length) * 100) / 100;
  };
  const medias = {
    loja: Object.fromEntries(METRICAS_TODAS.map((m) => [m, mediaDe(daLoja, m)])) as Record<Metrica, number | null>,
    geral: Object.fromEntries(METRICAS_TODAS.map((m) => [m, mediaDe(elegiveisIds, m)])) as Record<Metrica, number | null>,
  };

  const pctComparavel = eu.anterior.metaMensal ? (eu.anterior.faturamento / eu.anterior.metaMensal) * 100 : 0;
  return {
    agora: agora.toISOString(),
    vendedor: { id: vendedor.id, nome: vendedor.nome, primeiroNome: vendedor.nome.split(' ')[0], lojaId: vendedor.lojaId, empresa: empresa.nome, admitidoEm, novo: admitidoEm.slice(0, 7) === mes },
    lojas,
    pessoas: visao.elegiveis.map((v) => ({ id: v.id, nome: v.nome, lojaId: v.lojaId })),
    status: { sincronizadoEm: frescor.sincronizadoEm?.toISOString() ?? null, desatualizado: frescor.desatualizado, rankingDisponivel: elegiveisIds.length > 0, diaDeFolga: false, lojaFechada: false, offline: false },
    hoje: { meta: eu.metaDiaria, realizado: realizado(eu.hoje) },
    mes: { meta: eu.metaMensal, realizado: realizado(eu.mes), diasTrabalhoRestantes: calcularDiasRestantes(eu.diasPrevistos, trabalhadosAteOntem), diasTrabalhados: eu.mes.diasTrabalhados },
    referencia,
    rankings: { loja: rankingsPorMetrica(visao, daLoja, vendedorId), geral: rankingsPorMetrica(visao, elegiveisIds, vendedorId), lojas: rankingLojas(visao, lojas.map((l) => l.id)), lojasFormula: visao.config.lojaXLoja.ativo ? visao.config.lojaXLoja.formula : null, medias },
    xp: extrato.xp,
    nivel: detalharNivel(extrato.xp.total),
    moedas: extrato.moedas,
    sequencia: { atual: sequencia.atual, maior: Math.max(sequencia.maior, recordes.find((r) => r.tipo === 'MAIOR_SEQUENCIA')?.valor ?? 0), criterio: 'dias de trabalho seguidos com a meta diária batida' },
    missoes,
    competicoes,
    campanhas,
    campanhaEmDestaque: campanhas.some((c) => c.status === 'ATIVA'),
    conquistas,
    recordes,
    feed,
    reconhecimentos: reconhecimentos.map((r) => {
      const autor = autores.find((a) => a.id === r.authorId);
      return { id: r.id, quando: r.createdAt.toISOString(), autor: autor?.papel === 'ADMIN' ? `Administração ${empresa.nome}` : (autor?.nome ?? empresa.nome), motivo: MOTIVO_RECONHECIMENTO[r.tipo] ?? 'OUTRO', titulo: r.titulo ?? 'Reconhecimento', mensagem: r.message ?? '' };
    }),
    historico,
    comparavel: { ...realizado(eu.anterior), percentualMeta: Math.round(pctComparavel * 10) / 10 },
    celebracoes,
    indicadores,
    metricasRanking: metricas,
    metricaCorrida: metricas.includes(config.metricaCorrida) ? config.metricaCorrida : (metricas[0] ?? 'VENDAS'),
    elegibilidade: { elegivel, motivo: elegivel ? null : vendedor.motivoInelegivel ?? 'Fora do ranking por decisão da administração.' },
  };
}
