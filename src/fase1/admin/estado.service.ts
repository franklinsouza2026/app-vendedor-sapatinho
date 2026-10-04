// Estado da central do Admin (Fase 1) — tudo o que as telas homologadas do
// Admin leem, montado no servidor com dado real e já ESCOPADO à empresa do
// token. As ações do Admin são endpoints próprios (validados, auditados);
// este módulo só lê.
import { StatusConta } from '@prisma/client';
import { prisma } from '../../db';
import { timezoneDaEmpresa } from '../../tempo/empresa';
import { mesLocal } from '../../tempo/dia';
import { FONTE_INDICADOR, INDICADORES, obterConfigFase1 } from '../config.service';
import { metasDoMesEmLote } from '../metas.service';
import { listarMissoes } from '../missoes/missoes.service';
import { classificacao, serializarCompeticao } from '../competicoes/competicoes.service';
import { atualizarCampanhasPeloRelogio, serializarCampanha } from '../campanhas/campanhas.service';
import { listarPremios } from '../incentivos/premios.service';
import { listarProdutos } from '../incentivos/produtos.service';
import { rankingLojas, montarLinhas, visaoRankingEmpresa } from '../ranking/ranking.service';
import { estatisticasDoMes } from '../ranking/estatisticas.service';
import { getRegraAtiva, REGUA_V1 } from '../../gamificacao/regras.service';
import { detalharNivel, NIVEL_XP_V1 } from '../../gamificacao/niveis';
import { diaLocal } from '../../tempo/dia';
import { extratoDoVendedor } from '../painel/extrato.service';

const STATUS: Record<StatusConta, 'ATIVO' | 'PENDENTE' | 'BLOQUEADO' | 'DESLIGADO'> = { ACTIVE: 'ATIVO', PENDING_ACTIVATION: 'PENDENTE', BLOCKED: 'BLOQUEADO', OFFBOARDED: 'DESLIGADO' };

const NOTA_INDICADOR: Record<string, string> = {
  VENDAS: 'Faturamento das vendas recebidas pelo ERP (cancelamentos e devoluções descontados).',
  QTD_VENDAS: 'Contagem de vendas válidas.',
  PARES: 'Soma de pares dos itens vendidos (informado pelo ERP).',
  TICKET: 'Faturamento ÷ vendas.',
  PA: 'Pares ÷ vendas.',
  PERCENTUAL_META: 'Depende de meta mensal cadastrada.',
  SCORE: 'Meta 40%, evolução 20%, PA 15%, ticket 15%, consistência 10% (régua v1).',
  EVOLUCAO: '% da meta contra o mesmo período do mês anterior.',
  CONSISTENCIA: 'Dias trabalhados com a meta diária batida.',
  CONVERSAO: 'Sem fonte: o ERP não registra atendimento sem venda.',
};

/** Rótulo de gestão para cada ação auditada (o Admin nunca vê código interno). */
const ROTULO_ACAO: Record<string, string> = {
  USER_PREAUTHORIZED: 'Cadastrou vendedor',
  USER_ACTIVATED: 'Vendedor ativou o acesso',
  USER_BLOCKED: 'Bloqueou vendedor',
  USER_UNBLOCKED: 'Desbloqueou vendedor',
  USER_OFFBOARDED: 'Desligou vendedor',
  USER_REACTIVATED: 'Reativou vendedor',
  USER_RELOCATED: 'Transferiu vendedor de loja',
  PASSWORD_CHANGED: 'Senha alterada',
  ACCESS_REISSUED: 'Reemitiu acesso',
  STORE_CREATED: 'Cadastrou loja',
  STORE_UPDATED: 'Editou loja',
  STORE_DEACTIVATED: 'Inativou loja',
  STORE_REACTIVATED: 'Reativou loja',
  ERP_IDENTITY_LINKED: 'Vinculou vendedor ao ERP',
  ERP_IDENTITY_UNLINKED: 'Desvinculou vendedor do ERP',
  MONTHLY_GOAL_SET: 'Alterou meta do mês',
  WORKDAYS_SET: 'Alterou dias de trabalho previstos',
  STORE_GOAL_SET: 'Alterou meta da loja',
  GOAL_CREATED: 'Cadastrou meta',
  GOAL_UPDATED: 'Alterou meta',
  GOAL_DELETED: 'Removeu meta',
  PRODUCT_CREATED: 'Cadastrou produto',
  PRODUCT_UPDATED: 'Editou produto',
  PRIZE_CREATED: 'Cadastrou prêmio',
  MISSION_CREATED: 'Criou missão',
  MISSION_UPDATED: 'Editou missão',
  MISSION_PUBLISHED: 'Publicou missão',
  MISSION_FINISHED: 'Encerrou missão',
  MISSION_CANCELLED: 'Cancelou missão',
  MISSION_ARCHIVED: 'Arquivou missão',
  CAMPAIGN_CREATED: 'Criou campanha',
  CAMPAIGN_UPDATED: 'Editou campanha',
  CAMPAIGN_PUBLISHED: 'Publicou campanha',
  CAMPAIGN_FINISHED: 'Encerrou campanha',
  CAMPAIGN_CANCELLED: 'Cancelou campanha',
  CAMPAIGN_ARCHIVED: 'Arquivou campanha',
  CAMPAIGN_REWARD_GRANTED: 'Prêmios da campanha creditados',
  COMPETITION_CREATED: 'Publicou competição',
  COMPETITION_STARTED: 'Competição começou',
  COMPETITION_FINISHED: 'Encerrou competição',
  COMPETITION_CANCELLED: 'Cancelou competição',
  COMPETITION_ARCHIVED: 'Arquivou competição',
  COMPETITION_REWARD_GRANTED: 'Prêmios da competição creditados',
  RECOGNITION_CREATED: 'Reconheceu vendedor',
  FASE1_CONFIG_UPDATED: 'Alterou rankings, indicadores ou feed',
  ELIGIBILITY_CHANGED: 'Alterou elegibilidade',
  LEDGER_ADJUSTMENT: 'Ajuste de XP/VendaCoins',
  ENGAGEMENT_REWARD_CONFIG_UPDATED: 'Alterou recompensa de acesso diário',
  INTEGRATION_CREATED: 'Criou integração',
  INTEGRATION_CONFIG_UPDATED: 'Editou integração',
  INTEGRATION_CREDENTIAL_ROTATED: 'Substituiu credencial da integração',
  INTEGRATION_ACTIVATED: 'Ativou integração',
  INTEGRATION_DEACTIVATED: 'Desativou integração',
  INTEGRATION_STORE_LINKED: 'Vinculou loja à integração',
  INTEGRATION_STORE_UNLINKED: 'Desvinculou loja da integração',
  INTEGRATION_SYNC_REQUESTED: 'Pediu sincronização',
  SESSIONS_REVOKED: 'Sessões encerradas',
  LOGIN_LOCKED: 'Login bloqueado por tentativas',
};

/** Ações operacionais do sistema que não interessam ao log do Admin (ruído). */
const FORA_DO_LOG = new Set(['FEED_EVENT_CREATED', 'COMPETITION_PARTICIPANT_ADDED']);

function textoMeta(m: Record<string, unknown> | null) {
  if (!m) return { entidade: '—', antes: null, depois: null, motivo: null };
  const entidade = (m.nome as string) ?? (m.mes ? `Mês ${m.mes}` : null) ?? (m.provedor as string) ?? '—';
  const fmt = (v: unknown) => (v === null || v === undefined ? null : typeof v === 'object' ? null : String(v));
  return { entidade, antes: fmt(m.antes), depois: fmt(m.depois ?? m.status), motivo: (m.motivo as string) ?? null };
}

export async function auditoriaLegivel(empresaId: string, limite = 200) {
  const eventos = await prisma.auditEvent.findMany({ where: { empresaId, acao: { notIn: [...FORA_DO_LOG] } }, orderBy: { createdAt: 'desc' }, take: limite, include: { ator: { select: { nome: true } }, alvo: { select: { nome: true } } } });
  return eventos.map((e) => {
    const t = textoMeta(e.metadata as Record<string, unknown> | null);
    return { id: e.id, quando: e.createdAt.toISOString(), usuario: e.ator?.nome ?? 'Sistema', acao: ROTULO_ACAO[e.acao] ?? e.acao, entidade: e.alvo?.nome ?? t.entidade, antes: t.antes, depois: t.depois, motivo: t.motivo };
  });
}

export async function montarEstadoAdmin(empresaId: string, agora = new Date()) {
  const tz = await timezoneDaEmpresa(empresaId);
  const mes = mesLocal(agora, tz);
  await atualizarCampanhasPeloRelogio(empresaId, agora);

  const [empresa, vendedores, lojas, metasLoja, integracoes, vendeuAlgumaVez, identidades, config, missoes, competicoes, campanhas, premios, produtos, reconhecimentos, auditoria] = await Promise.all([
    prisma.empresa.findUniqueOrThrow({ where: { id: empresaId } }),
    prisma.vendedor.findMany({ where: { empresaId, papel: { in: ['VENDEDOR'] } }, orderBy: { nome: 'asc' } }),
    prisma.loja.findMany({ where: { empresaId }, orderBy: { nome: 'asc' } }),
    prisma.metaLoja.findMany({ where: { empresaId, mes } }),
    prisma.integracao.findMany({ where: { empresaId }, include: { lojas: true } }),
    prisma.venda.findMany({ where: { empresaId }, select: { vendedorId: true }, distinct: ['vendedorId'] }),
    prisma.externalIdentity.findMany({ where: { empresaId, status: 'VERIFIED' }, select: { vendedorId: true } }),
    obterConfigFase1(empresaId),
    listarMissoes(empresaId, agora),
    prisma.competition.findMany({ where: { empresaId, tipoExibicao: { not: null } }, orderBy: { startsAt: 'desc' } }),
    prisma.campanha.findMany({ where: { empresaId }, include: { frentes: true }, orderBy: { inicio: 'desc' } }),
    listarPremios(empresaId),
    listarProdutos(empresaId),
    prisma.recognition.findMany({ where: { empresaId }, orderBy: { createdAt: 'desc' }, take: 100 }),
    auditoriaLegivel(empresaId),
  ]);
  const comVenda = new Set(vendeuAlgumaVez.map((v) => v.vendedorId));
  const verificados = new Set(identidades.map((i) => i.vendedorId));
  const metas = await metasDoMesEmLote(vendedores.map((v) => v.id), mes, tz);
  const autores = await prisma.vendedor.findMany({ where: { id: { in: reconhecimentos.map((r) => r.authorId) } }, select: { id: true, nome: true } });

  const ultimaSyncDaLoja = (lojaId: string) =>
    integracoes
      .filter((i) => i.status === 'ATIVA' && i.lojas.some((l) => l.lojaId === lojaId))
      .map((i) => i.ultimaSyncSucessoEm)
      .filter((d): d is Date => Boolean(d))
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

  const MOTIVO_RECONHECIMENTO: Record<string, string> = { PERFORMANCE: 'RESULTADO', EVOLUTION: 'EVOLUCAO', INITIATIVE: 'INICIATIVA', TEAMWORK: 'EQUIPE', OVERCOMING: 'SUPERACAO' };
  const competicoesComClassificacao = await Promise.all(
    competicoes.map(async (c) => ({ ...serializarCompeticao(c), classificacao: c.status === 'SCHEDULED' || c.status === 'CANCELLED' ? [] : (await classificacao(c, agora)).flatMap((g) => g.linhas.map((l) => ({ ...l, grupo: g.grupo }))) }))
  );

  // ---- desempenho real da empresa (Admin vê valores de todos: escopo de gestão)
  const visao = await visaoRankingEmpresa(empresaId, agora);
  const regra = await getRegraAtiva(empresaId).catch(() => ({ versao: 0, regrasXp: REGUA_V1.regrasXp, regrasMoeda: REGUA_V1.regrasMoeda, pesosScore: REGUA_V1.pesosScore }));
  const naoElegiveis = vendedores.filter((v) => !visao.agora.has(v.id)).map((v) => v.id);
  const statsExtra = naoElegiveis.length ? await estatisticasDoMes({ empresaId, vendedorIds: naoElegiveis, mes, ateDia: diaLocal(agora, tz), hoje: diaLocal(agora, tz), tz, pesos: regra.pesosScore }) : new Map();
  const posGeral = new Map(montarLinhas(visao.elegiveis.map((v) => v.id), visao.agora, null, 'VENDAS', null).map((l) => [l.pessoaId, l.posicao]));
  const posLoja = new Map<string, number>();
  for (const lojaId of new Set(visao.elegiveis.map((v) => v.lojaId))) for (const l of montarLinhas(visao.elegiveis.filter((v) => v.lojaId === lojaId).map((v) => v.id), visao.agora, null, 'VENDAS', null)) posLoja.set(l.pessoaId, l.posicao);
  const [xps, moedasSaldo] = await Promise.all([
    prisma.xpTransacao.groupBy({ by: ['vendedorId'], where: { empresaId }, _sum: { quantidade: true } }),
    prisma.moedaTransacao.groupBy({ by: ['vendedorId'], where: { empresaId }, _sum: { valor: true } }),
  ]);
  const desempenho = vendedores.map((v) => {
    const e = visao.agora.get(v.id) ?? statsExtra.get(v.id);
    const xp = xps.find((x) => x.vendedorId === v.id)?._sum.quantidade ?? 0;
    return {
      vendedorId: v.id,
      mes: { faturamento: e?.mes.faturamento ?? 0, vendas: e?.mes.vendas ?? 0, pares: e?.mes.pares ?? 0, percentualMeta: e?.percentualMeta ?? null },
      hoje: { faturamento: e?.hoje.faturamento ?? 0, vendas: e?.hoje.vendas ?? 0 },
      metaDiaria: e?.metaDiaria ?? null,
      ticket: e?.ticket ?? null,
      pa: e?.pa ?? null,
      score: e?.score ?? null,
      acessosNoMes: e?.acessosNoMes ?? 0,
      posicaoLoja: posLoja.get(v.id) ?? null,
      posicaoGeral: posGeral.get(v.id) ?? null,
      xp,
      moedas: moedasSaldo.find((x) => x.vendedorId === v.id)?._sum.valor ?? 0,
      nivel: detalharNivel(xp),
    };
  });
  const movimentacoes = await Promise.all(
    (await prisma.moedaTransacao.findMany({ where: { empresaId }, orderBy: { ocorridoEm: 'desc' }, take: 40, select: { vendedorId: true } }))
      .map((m) => m.vendedorId)
      .filter((id, i, a) => a.indexOf(id) === i)
      .slice(0, 10)
      .map(async (id) => ({ vendedorId: id, extrato: await extratoDoVendedor(id, 10) }))
  );
  const nomePorId = new Map(vendedores.map((v) => [v.id, v.nome]));
  const gamificacao = {
    regua: { versao: regra.versao, xp: regra.regrasXp, moedas: regra.regrasMoeda },
    niveis: NIVEL_XP_V1.map((n) => ({ nivel: n.nivel, nome: n.nome, xpMinimo: n.xpMinimo })),
    movimentacoesXp: movimentacoes.flatMap((m) => m.extrato.xp.historico.map((h) => ({ ...h, vendedor: nomePorId.get(m.vendedorId) ?? '—' }))).sort((a, b) => b.quando.localeCompare(a.quando)).slice(0, 30),
    movimentacoesMoedas: movimentacoes.flatMap((m) => m.extrato.moedas.historico.map((h) => ({ ...h, vendedor: nomePorId.get(m.vendedorId) ?? '—' }))).sort((a, b) => b.quando.localeCompare(a.quando)).slice(0, 30),
    conquistas: await prisma.badge.findMany({ orderBy: { codigo: 'asc' } }).then(async (badges) => {
      const contagem = await prisma.badgeConcessao.groupBy({ by: ['badgeId'], where: { empresaId, revogadoEm: null }, _count: { _all: true } });
      return badges.filter((b) => b.categoria !== 'PREMIO' || contagem.some((c) => c.badgeId === b.id)).map((b) => ({ codigo: b.codigo, titulo: b.titulo, descricao: b.descricao, conquistaram: contagem.find((c) => c.badgeId === b.id)?._count._all ?? 0 }));
    }),
  };

  return {
    agora: agora.toISOString(),
    empresa: { id: empresa.id, nome: empresa.nome, timezone: tz },
    desempenho,
    lojaXLoja: rankingLojas(visao, lojas.filter((l) => l.ativa).map((l) => l.id)),
    gamificacao,
    mes,
    vendedores: vendedores.map((v) => ({
      id: v.id,
      nome: v.nome,
      lojaId: v.lojaId,
      matricula: v.matriculaErp,
      status: STATUS[v.status],
      admitidoEm: (v.admitidoEm ?? v.createdAt).toISOString().slice(0, 10),
      vinculoErp: comVenda.has(v.id) || verificados.has(v.id) ? 'VERIFICADO' : 'PENDENTE',
      elegivel: v.status === 'ACTIVE' && v.elegivelRanking,
      motivoInelegivel: v.status !== 'ACTIVE' ? 'DESLIGADO' : v.elegivelRanking ? null : 'EXCECAO',
      excecao: v.elegivelRanking ? null : v.motivoInelegivel,
    })),
    lojas: lojas.map((l) => ({ id: l.id, nome: l.nome, codigo: l.codigoErp, status: l.ativa ? 'ATIVA' : 'INATIVA', ultimaSync: ultimaSyncDaLoja(l.id)?.toISOString() ?? null, metaMes: Number(metasLoja.find((m) => m.lojaId === l.id)?.valor ?? 0) || null })),
    metas: { referencia: mes, individuais: Object.fromEntries([...metas.entries()].map(([id, m]) => [id, { mensal: m.mensal, diasPrevistos: m.diasPrevistos, diaria: m.diaria }])) },
    indicadores: Object.fromEntries(INDICADORES.map((i) => [i, { ativo: config.indicadores[i], fonte: FONTE_INDICADOR[i], nota: NOTA_INDICADOR[i] }])),
    rankings: { metricasAtivas: config.metricasRanking, metricaCorrida: config.metricaCorrida, lojaXLoja: { status: config.lojaXLoja.ativo ? 'ATIVO' : 'AGUARDANDO_REGRA', formula: config.lojaXLoja.formula, lojas: config.lojaXLoja.lojas } },
    feedTipos: config.feedTipos,
    produtos,
    missoes,
    competicoes: competicoesComClassificacao,
    campanhas: campanhas.map((c) => serializarCampanha(c, agora)),
    premios,
    reconhecimentos: reconhecimentos.map((r) => ({ id: r.id, vendedorId: r.subjectId, motivo: MOTIVO_RECONHECIMENTO[r.tipo] ?? 'OUTRO', titulo: r.titulo ?? 'Reconhecimento', mensagem: r.message ?? '', quando: r.createdAt.toISOString(), autor: autores.find((a) => a.id === r.authorId)?.nome ?? '—' })),
    auditoria,
  };
}
