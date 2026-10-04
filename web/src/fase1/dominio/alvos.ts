/**
 * Deriva da foto de dados tudo o que a tela precisa para responder
 * "onde estou / quanto falta / qual a minha próxima oportunidade".
 *
 * Nada aqui é escrito à mão: mudou o dado do servidor, muda o texto.
 */
import type { Alvo, Fase1Dados, Metrica, Missao } from './tipos';
import { falta, ordenarRanking, ordenarRankingLojas, proximoMarco, UNIDADE_METRICA, vendasEstimadas, type PosicaoCalculada } from './estimativas';
import type { LinhaRankingBruta, LinhaRankingLoja } from './tipos';
import { distanciaMetrica, plural, reais } from '../formato';

export interface MinhaPosicao {
  posicao: number;
  total: number;
  variacao: number | null;
  distanciaAcima: number | null;
  nomeAcima: string | null;
}

export function rankingCalculado(dados: Fase1Dados, escopo: 'loja' | 'geral', metrica: Metrica): PosicaoCalculada<LinhaRankingBruta>[] {
  return ordenarRanking(dados.rankings[escopo][metrica]);
}

export function minhaPosicao(dados: Fase1Dados, escopo: 'loja' | 'geral', metrica: Metrica): MinhaPosicao | null {
  if (!dados.status.rankingDisponivel || !dados.elegibilidade.elegivel) return null;
  const linhas = rankingCalculado(dados, escopo, metrica);
  const i = linhas.findIndex((l) => l.linha.pessoaId === dados.vendedor.id);
  if (i === -1) return null;
  const acima = i > 0 ? dados.pessoas.find((p) => p.id === linhas[i - 1].linha.pessoaId) : null;
  return {
    posicao: linhas[i].posicao,
    total: linhas.length,
    variacao: linhas[i].variacao,
    distanciaAcima: linhas[i].distanciaAcima,
    nomeAcima: acima ? primeiroNome(acima.nome) : null,
  };
}

export function rankingLojasCalculado(dados: Fase1Dados): PosicaoCalculada<LinhaRankingLoja>[] {
  return ordenarRankingLojas(dados.rankings.lojas);
}

export function primeiroNome(nome: string): string {
  return nome.split(' ')[0];
}

export function faltaMissao(m: Missao): number {
  return Math.max(0, m.alvo - m.progresso);
}

export function textoUnidade(unidade: Missao['unidade'], n: number): string {
  switch (unidade) {
    case 'venda':
      return plural(n, 'venda');
    case 'par':
      return plural(n, 'par', 'pares');
    case 'dia':
      return plural(n, 'dia');
    case 'reais':
      return reais(n);
  }
}

const TIPOS_DESAFIO: Missao['tipo'][] = ['PRODUTO_SEMANA', 'PONTA_ESTOQUE', 'CATEGORIA'];

/** Todos os candidatos a alvo. Ordenação fica em `proximoAlvo.ts` (regra provisória). */
export function derivarAlvos(dados: Fase1Dados): Alvo[] {
  const alvos: Alvo[] = [];
  const ticket = dados.referencia.ticketMedio;
  const pa = dados.referencia.pa;
  const operando = !dados.status.diaDeFolga && !dados.status.lojaFechada;

  // Meta do dia — ou, se já batida, o próximo marco (110/120/150%).
  const { meta: metaDia, realizado: rDia } = dados.hoje;
  const faltaDia = falta(rDia.faturamento, metaDia);
  if (operando && faltaDia !== null && faltaDia > 0) {
    alvos.push({ id: 'meta-dia', tipo: 'META_DIA', icone: '🎯', falta: reais(faltaDia), objetivo: 'para bater sua meta de hoje', esforcoVendas: vendasEstimadas(faltaDia, ticket), rota: '/desempenho' });
  } else if (operando && faltaDia === 0) {
    const marco = proximoMarco(rDia.faturamento, metaDia);
    if (marco) {
      alvos.push({ id: 'marco-dia', tipo: 'META_DIA', icone: '🎯', falta: reais(marco.faltaReais), objetivo: `para chegar a ${marco.marco}% da meta de hoje`, esforcoVendas: vendasEstimadas(marco.faltaReais, ticket), rota: '/desempenho' });
    }
  }

  // Corrida da loja, na métrica que o Admin escolheu (só Vendas em R$ converte em vendas).
  const metrica = dados.metricaCorrida;
  const pos = minhaPosicao(dados, 'loja', metrica);
  if (pos && pos.distanciaAcima !== null && pos.posicao > 1) {
    const alvoPos = pos.posicao - 1;
    const emReais = metrica === 'VENDAS';
    alvos.push({ id: 'ranking-loja', tipo: 'RANKING', icone: '🏆', falta: emReais ? reais(pos.distanciaAcima) : distanciaMetrica(metrica, pos.distanciaAcima), objetivo: `para alcançar o ${alvoPos}º lugar da loja${emReais ? '' : ` em ${UNIDADE_METRICA[metrica].curto}`}`, esforcoVendas: emReais ? vendasEstimadas(pos.distanciaAcima, ticket) : null, rota: '/ranking' });
  }

  // Missões e desafios em andamento.
  for (const m of dados.missoes) {
    if (m.concluidaEm) continue;
    const f = faltaMissao(m);
    if (f <= 0) continue;
    const esforcoVendas = m.unidade === 'venda' ? f : m.unidade === 'par' ? (pa ? Math.ceil(f / pa) : null) : m.unidade === 'reais' ? vendasEstimadas(f, ticket) : null;
    const desafio = TIPOS_DESAFIO.includes(m.tipo);
    alvos.push({
      id: `missao-${m.id}`,
      tipo: desafio ? 'DESAFIO' : 'MISSAO',
      icone: desafio ? '👠' : '🔥',
      falta: textoUnidade(m.unidade, f),
      objetivo: `para concluir “${m.titulo}”`,
      esforcoVendas,
      rota: `/desafios/missao/${m.id}`,
    });
  }

  // Nível — só entra como alvo quando está realmente perto (≤ 200 XP).
  const nivel = dados.nivel;
  if (nivel.proximo && nivel.faltaXp !== null && nivel.faltaXp <= 200) {
    alvos.push({ id: 'nivel', tipo: 'NIVEL', icone: '⭐', falta: `${nivel.faltaXp} XP`, objetivo: `para subir para ${nivel.proximo.nome}`, esforcoVendas: null, rota: '/progresso' });
  }

  // Recordes em disputa (melhor mês / melhor dia).
  for (const r of dados.recordes) {
    if (r.unidade !== 'reais' || r.atual === null || r.atual >= r.valor) continue;
    const f = r.valor - r.atual;
    alvos.push({ id: `recorde-${r.tipo}`, tipo: 'RECORDE', icone: '🚀', falta: reais(f), objetivo: r.tipo === 'MELHOR_MES' ? 'para fazer seu melhor mês' : 'para fazer seu melhor dia', esforcoVendas: vendasEstimadas(f, ticket), rota: '/recordes' });
  }

  return alvos;
}
