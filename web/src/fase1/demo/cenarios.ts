/**
 * ============================================================================
 *  DADOS DE DEMONSTRAÇÃO — FASE 1 (MOCK CONTROLADO)
 * ============================================================================
 *
 * Monta a visão da VENDEDORA a partir de duas fontes:
 *
 *   1. ESTADO DO ADMIN (`estado.ts`) — tudo que é CONFIGURAÇÃO: metas,
 *      calendário, indicadores, rankings, elegibilidade, missões, competições,
 *      campanhas, premiações, reconhecimentos, feed. O Admin muda → a vendedora
 *      recebe.
 *   2. CENÁRIO — tudo que é SITUAÇÃO: quanto já vendeu, posição dos colegas,
 *      hora do dia, celebrações pendentes. Um cenário pode forçar uma
 *      configuração para demonstrar um estado (ex.: "sem meta").
 *
 * Coerência por construção: o faturamento da vendedora alimenta os rankings,
 * e posições, distâncias, Próximo Alvo e recordes "em disputa" são derivados.
 *
 * Data fixa: quinta-feira, 22/10/2026 (corrida do mês com 8 dias de trabalho
 * restantes; campanha "Outubro Campeão" em andamento).
 */
import type {
  Campanha,
  Celebracao,
  Competicao,
  Conquista,
  EventoFeed,
  EventoMoedas,
  EventoXp,
  Fase1Dados,
  IndicadorVendedor,
  LinhaRankingBruta,
  Metrica,
  MesHistorico,
  Missao,
  Pessoa,
  Realizado,
  Recorde,
  StatusDados,
} from '../dominio/tipos';
import { pct, plural, reais } from '../formato';
import { proximoMarco } from '../dominio/estimativas';
import { calcularNivel, NIVEIS_V1 } from '../dominio/niveis';
import { LIMITE_SYNC_MIN, minutosDesde } from '../dominio/admin';
import { diasValidosRestantes, feriadoHoje, metaDiariaVigente, opcoesMetaDiaria } from './calendarioDemo';
import { type EstadoDemo, estadoInicial, type MotivoInelegivel } from './estado';

export const EU = 'ana';

// ------------------------------------------------------------ régua v1 (espelho do backend)

/** Espelho de REGUA_V1 (src/gamificacao/regras.service.ts) — só para o mock ficar coerente. */
export const REGUA_V1 = {
  META_DIARIA_100: { xp: 100, moedas: 50 },
  META_DIARIA_110: { xp: 30, moedas: 20 },
  META_DIARIA_120: { xp: 50, moedas: 30 },
  META_DIARIA_150: { xp: 100, moedas: 50 },
  MELHORA_PA: { xp: 30, moedas: 10 },
  MELHORA_TICKET: { xp: 30, moedas: 10 },
  STREAK_3: { xp: 75, moedas: 25 },
  STREAK_5: { xp: 150, moedas: 50 },
  STREAK_10: { xp: 300, moedas: 100 },
} as const;

// ------------------------------------------------------------ perfis (situação do mês)

interface Perfil extends Pessoa {
  vendas: number;
  meta: number;
  evolucao: number;
  pa: number;
  ticket: number;
  consistencia: number;
  score: number;
  tendencia: number;
}

/** Desempenho do mês de cada vendedor (o cadastro vem do estado do Admin). */
const DESEMPENHO: Record<string, Omit<Perfil, 'id' | 'nome' | 'lojaId' | 'meta'>> = {
  ana: { vendas: 23200, evolucao: 6.1, pa: 1.8, ticket: 249, consistencia: 9, score: 812, tendencia: 1 },
  julia: { vendas: 23520, evolucao: 2.4, pa: 1.65, ticket: 262, consistencia: 11, score: 836, tendencia: 0 },
  maria: { vendas: 21900, evolucao: -1.8, pa: 1.92, ticket: 231, consistencia: 8, score: 790, tendencia: -1 },
  joao: { vendas: 19850, evolucao: 8.9, pa: 1.71, ticket: 228, consistencia: 7, score: 771, tendencia: 0 },
  carla: { vendas: 16400, evolucao: 11.4, pa: 1.58, ticket: 205, consistencia: 5, score: 702, tendencia: 0 },
  bruna: { vendas: 26100, evolucao: 3.2, pa: 1.88, ticket: 271, consistencia: 12, score: 861, tendencia: 0 },
  rafaela: { vendas: 24800, evolucao: 5.0, pa: 1.74, ticket: 255, consistencia: 12, score: 849, tendencia: 1 },
  lucas: { vendas: 21000, evolucao: -0.6, pa: 1.62, ticket: 240, consistencia: 9, score: 781, tendencia: -1 },
  patricia: { vendas: 18900, evolucao: 4.1, pa: 2.05, ticket: 214, consistencia: 6, score: 760, tendencia: 0 },
  tais: { vendas: 15200, evolucao: 9.7, pa: 1.69, ticket: 199, consistencia: 4, score: 690, tendencia: 1 },
  camila: { vendas: 25300, evolucao: 1.1, pa: 1.77, ticket: 266, consistencia: 10, score: 842, tendencia: -1 },
  renata: { vendas: 23900, evolucao: 0.4, pa: 1.81, ticket: 247, consistencia: 10, score: 818, tendencia: -1 },
  diego: { vendas: 23400, evolucao: 2.9, pa: 1.6, ticket: 259, consistencia: 8, score: 798, tendencia: 0 },
  fernanda: { vendas: 17800, evolucao: 7.5, pa: 1.95, ticket: 210, consistencia: 7, score: 744, tendencia: 0 },
  livia: { vendas: 14100, evolucao: 12.8, pa: 1.52, ticket: 188, consistencia: 3, score: 655, tendencia: 0 },
};

/** Desempenho do mês por vendedor — exposto para as telas do Admin (detalhe, lojas). */
export function desempenhoDemo(id: string) {
  return DESEMPENHO[id] ?? null;
}

const VALOR_METRICA: Record<Metrica, (p: Perfil) => number> = {
  SCORE: (p) => p.score,
  VENDAS: (p) => p.vendas,
  PERCENTUAL_META: (p) => (p.meta > 0 ? Math.round((p.vendas / p.meta) * 1000) / 10 : 0),
  EVOLUCAO: (p) => p.evolucao,
  PA: (p) => p.pa,
  TICKET: (p) => p.ticket,
  CONSISTENCIA: (p) => p.consistencia,
};

const METRICAS = Object.keys(VALOR_METRICA) as Metrica[];

function montarRanking(perfis: Perfil[], metrica: Metrica, fatorTendencia: number): LinhaRankingBruta[] {
  const ordenados = [...perfis].sort((a, b) => VALOR_METRICA[metrica](b) - VALOR_METRICA[metrica](a));
  return ordenados.map((p, i) => ({
    pessoaId: p.id,
    valor: VALOR_METRICA[metrica](p),
    posicaoAnterior: Math.min(perfis.length, Math.max(1, i + 1 + p.tendencia * fatorTendencia)),
  }));
}

function porMetrica(f: (m: Metrica) => LinhaRankingBruta[]): Record<Metrica, LinhaRankingBruta[]> {
  return Object.fromEntries(METRICAS.map((m) => [m, f(m)])) as Record<Metrica, LinhaRankingBruta[]>;
}

// ------------------------------------------------------------ rascunho

interface Rascunho {
  estado: EstadoDemo;
  cenarioId: string;
  agora: string;
  novo: boolean;
  status: StatusDados;
  hoje: { realizado: Realizado };
  mes: { realizado: Realizado; diasTrabalhados: number };
  /** undefined = vem do Admin; number/null = o cenário força. */
  metaHojeForcada?: number | null;
  metaMesForcada?: number | null;
  diasRestantesForcado?: number | null;
  referenciaOrigem: 'MES' | 'LOJA' | 'NENHUMA';
  perfis: Perfil[];
  pontosLojas: { lojaId: string; pontos: number; posicaoAnterior: number | null }[];
  xpTotal: number;
  xpHistorico: EventoXp[];
  moedas: { saldo: number; historico: EventoMoedas[] };
  sequencia: { atual: number; maior: number };
  missoes: Missao[];
  semCompeticoes: boolean;
  campanhaEmDestaque: boolean;
  encerrarCampanhaAtiva: boolean;
  conquistas: Conquista[];
  recordes: Recorde[];
  feed: EventoFeed[];
  historico: MesHistorico[];
  /** Celebração pode ser função dos dados finais — o texto nunca fica com número fixo. */
  celebracoes: (Celebracao | ((d: Fase1Dados) => Celebracao))[];
  semReconhecimentos: boolean;
}

const AGORA = '2026-10-22T15:20:00';

function realizado(faturamento: number, vendas: number, pares: number): Realizado {
  return { faturamento, vendas, pares, ticketMedio: vendas > 0 ? faturamento / vendas : null, pa: vendas > 0 ? pares / vendas : null };
}

function conquistasBase(): Conquista[] {
  return [
    { codigo: 'PRIMEIRA_META', titulo: 'Primeira Meta', descricao: 'Bateu a meta diária pela primeira vez.', icone: '🎯', origem: 'CATALOGO', conquistadaEm: '2026-03-14' },
    { codigo: 'META_110', titulo: 'Meta 110%', descricao: 'Chegou a 110% da meta num dia.', icone: '📈', origem: 'PROPOSTA', conquistadaEm: '2026-07-09' },
    { codigo: 'META_120', titulo: 'Meta 120%', descricao: 'Chegou a 120% da meta num dia.', icone: '🚀', origem: 'PROPOSTA', conquistadaEm: '2026-09-12' },
    { codigo: 'META_150', titulo: 'Meta 150%', descricao: 'Chegou a 150% da meta num dia.', icone: '💥', origem: 'PROPOSTA', conquistadaEm: null, falta: 'seu melhor dia chegou a 149%', progresso: 99 },
    { codigo: 'PA_MASTER', titulo: 'PA Master', descricao: 'Melhorou o PA em relação à própria base.', icone: '👟', origem: 'CATALOGO', conquistadaEm: '2026-08-30' },
    { codigo: 'TICKET_MASTER', titulo: 'Ticket Master', descricao: 'Melhorou o ticket médio em relação à própria base.', icone: '💎', origem: 'CATALOGO', conquistadaEm: null, falta: 'ticket do mês R$ 249 · base R$ 258', progresso: 96 },
    { codigo: 'STREAK_7', titulo: '7 Dias Consecutivos', descricao: 'Bateu a meta diária 7 dias seguidos.', icone: '🔥', origem: 'CATALOGO', conquistadaEm: null, falta: 'faltam 3 dias de meta batida', progresso: 57 },
    { codigo: 'TOP_3', titulo: 'Pódio', descricao: 'Terminou entre os 3 primeiros de uma competição.', icone: '🥉', origem: 'CATALOGO', conquistadaEm: '2026-09-30' },
    { codigo: 'PRIMEIRO_LUGAR', titulo: 'Número 1', descricao: 'Fechou um mês em 1º lugar na loja.', icone: '🥇', origem: 'PROPOSTA', conquistadaEm: '2026-07-31' },
    { codigo: 'MAIOR_EVOLUCAO', titulo: 'Maior Evolução', descricao: 'Maior evolução de Score Geral numa competição.', icone: '🌱', origem: 'CATALOGO', conquistadaEm: null, falta: 'você é 3ª em “Quem Mais Cresceu”' },
    { codigo: 'RECORDE_PESSOAL', titulo: 'Quebra-recorde', descricao: 'Superou um recorde pessoal.', icone: '🏅', origem: 'PROPOSTA', conquistadaEm: '2026-09-12' },
    { codigo: 'CONSISTENCIA', titulo: 'Consistência', descricao: 'Venceu uma competição de consistência.', icone: '🧱', origem: 'CATALOGO', conquistadaEm: null },
    { codigo: 'DESTAQUE_DA_EQUIPE', titulo: 'Destaque da Equipe', descricao: 'A loja venceu uma competição entre lojas.', icone: '🏬', origem: 'CATALOGO', conquistadaEm: null, falta: 'Batalha das Lojas termina em 31/10' },
    { codigo: 'CAMPEAO_DA_SEASON', titulo: 'Campeão da Temporada', descricao: '1º lugar geral numa temporada.', icone: '👑', origem: 'CATALOGO', conquistadaEm: null },
  ];
}

/** Catálogo de conquistas da demonstração — exposto para o Admin consultar. */
export function catalogoConquistas(): Conquista[] {
  return conquistasBase();
}

function recordesBase(): Recorde[] {
  return [
    { tipo: 'MELHOR_MES', titulo: 'Melhor mês', unidade: 'reais', valor: 27450, quando: '2026-05-31', atual: null },
    { tipo: 'MELHOR_DIA', titulo: 'Melhor dia', unidade: 'reais', valor: 2980, quando: '2026-09-12', atual: null },
    { tipo: 'MAIOR_TICKET', titulo: 'Maior venda', unidade: 'reais', valor: 1290, quando: '2026-08-16', atual: null },
    { tipo: 'MELHOR_PA', titulo: 'Melhor PA no mês', unidade: 'pa', valor: 2.04, quando: '2026-08-31', atual: null },
    { tipo: 'MAIOR_SEQUENCIA', titulo: 'Maior sequência de meta', unidade: 'dias', valor: 9, quando: '2026-07-20', atual: null },
    { tipo: 'MELHOR_POSICAO', titulo: 'Melhor posição na loja', unidade: 'posicao', valor: 1, quando: '2026-07-31', atual: null },
    { tipo: 'MAIOR_PERCENTUAL', titulo: 'Maior % de meta no mês', unidade: 'percentual', valor: 111.7, quando: '2026-07-31', atual: null },
  ];
}

function missoesDoEstado(estado: EstadoDemo, lojaId: string, agora: string): Missao[] {
  const produto = (ref: string) => estado.produtos.find((p) => p.referencia === ref);
  const premio = (id: string | null) => (id ? estado.premios.find((p) => p.id === id)?.nome : undefined);
  return estado.missoes
    .filter((m) => m.status === 'ATIVA' && (m.lojas === 'TODAS' || m.lojas.includes(lojaId)) && m.inicio <= agora)
    .map((m) => ({
      id: m.id,
      tipo: m.tipo,
      titulo: m.nome,
      descricao: m.descricao,
      unidade: m.unidade,
      progresso: m.progressoDemo,
      alvo: m.alvo,
      recompensa: { xp: m.xp, moedas: m.moedas },
      terminaEm: m.fim,
      produtos: m.produtos.length ? m.produtos.map((ref) => ({ referencia: ref, nome: produto(ref)?.nome ?? 'Produto não cadastrado', foto: produto(ref)?.foto })) : undefined,
      premio: premio(m.premioId),
      regra: m.regras || undefined,
    }));
}

function rascunhoBase(estado: EstadoDemo, cenarioId: string): Rascunho {
  const cad = (id: string) => estado.vendedores.find((v) => v.id === id);
  const perfis: Perfil[] = Object.entries(DESEMPENHO)
    .filter(([id]) => cad(id))
    .map(([id, d]) => {
      const c = cad(id)!;
      return { id, nome: c.nome, lojaId: c.lojaId, meta: estado.metas.individuais[id]?.mensal ?? 0, ...d };
    });
  const lojaId = cad(EU)?.lojaId ?? 'caruaru';
  return {
    estado,
    cenarioId,
    agora: AGORA,
    novo: false,
    status: { sincronizadoEm: estado.lojas.find((l) => l.id === lojaId)?.ultimaSync ?? '2026-10-22T15:00:00', desatualizado: false, rankingDisponivel: true, diaDeFolga: false, lojaFechada: false, offline: false },
    hoje: { realizado: realizado(1514, 6, 11) },
    mes: { realizado: realizado(23200, 93, 167), diasTrabalhados: 17 },
    referenciaOrigem: 'MES',
    perfis,
    // ⚠️ Pontos Loja × Loja são ilustrativos — a fórmula do score entre lojas NÃO está decidida.
    pontosLojas: [
      { lojaId: 'caruaru', pontos: 842, posicaoAnterior: 2 },
      { lojaId: 'santacruz', pontos: 811, posicaoAnterior: 1 },
      { lojaId: 'difusora', pontos: 784, posicaoAnterior: 3 },
    ],
    xpTotal: 1640,
    xpHistorico: [
      { id: 'x1', quando: '2026-10-22T10:42:00', origem: 'Missão “Primeira venda do dia”', xp: 10 },
      { id: 'x2', quando: '2026-10-21T19:10:00', origem: 'Meta diária atingida', xp: REGUA_V1.META_DIARIA_100.xp },
      { id: 'x3', quando: '2026-10-21T19:10:00', origem: '110% da meta diária', xp: REGUA_V1.META_DIARIA_110.xp },
      { id: 'x4', quando: '2026-10-20T18:30:00', origem: 'Sequência de 3 dias', xp: REGUA_V1.STREAK_3.xp },
      { id: 'x5', quando: '2026-10-19T18:50:00', origem: 'Meta diária atingida', xp: REGUA_V1.META_DIARIA_100.xp },
      { id: 'x6', quando: '2026-10-17T12:00:00', origem: 'Missão “Combo da semana” (semana anterior)', xp: 40 },
      { id: 'x7', quando: '2026-10-15T18:00:00', origem: 'Melhora no PA', xp: REGUA_V1.MELHORA_PA.xp },
    ],
    moedas: {
      saldo: 340,
      historico: [
        { id: 'c1', quando: '2026-10-22T10:42:00', origem: 'Missão “Primeira venda do dia”', valor: 5 },
        { id: 'c2', quando: '2026-10-21T19:10:00', origem: 'Meta diária atingida', valor: REGUA_V1.META_DIARIA_100.moedas },
        { id: 'c3', quando: '2026-10-20T18:30:00', origem: 'Sequência de 3 dias', valor: REGUA_V1.STREAK_3.moedas },
        { id: 'c4', quando: '2026-10-17T12:00:00', origem: 'Missão “Combo da semana”', valor: 15 },
        { id: 'c5', quando: '2026-10-10T22:00:00', origem: 'Sprint da Semana — 2º lugar', valor: 40 },
        { id: 'c6', quando: '2026-10-03T14:00:00', origem: 'Ajuste por cancelamento de venda', valor: -5 },
      ],
    },
    sequencia: { atual: 4, maior: 9 },
    missoes: missoesDoEstado(estado, lojaId, AGORA),
    semCompeticoes: false,
    campanhaEmDestaque: false,
    encerrarCampanhaAtiva: false,
    conquistas: conquistasBase(),
    recordes: recordesBase(),
    feed: [
      { id: 'f1', tipo: 'META', quando: '2026-10-22T15:05:00', icone: '🎯', texto: 'Rafaela (Santa Cruz) bateu 100% da meta de hoje.' },
      { id: 'f2', tipo: 'POSICAO', quando: '2026-10-22T14:40:00', icone: '⬆️', texto: 'Você subiu para o 2º lugar na loja.', meu: true },
      { id: 'f3', tipo: 'RECORDE', quando: '2026-10-22T13:12:00', icone: '🚀', texto: 'Maria quebrou o recorde pessoal de PA.' },
      { id: 'f4', tipo: 'LOJA', quando: '2026-10-22T11:30:00', icone: '🏬', texto: 'Caruaru Shopping assumiu a liderança da Batalha das Lojas.', meu: true },
      { id: 'f5', tipo: 'CONQUISTA', quando: '2026-10-21T19:20:00', icone: '🔥', texto: 'João chegou a 5 dias seguidos de meta.' },
      { id: 'f6', tipo: 'COMPETICAO', quando: '2026-10-19T09:00:00', icone: '🏁', texto: 'Começou a competição “Sprint da Semana”.' },
    ],
    historico: [
      { mes: '2026-05', faturamento: 27450, meta: 26000, ticketMedio: 241, pa: 1.86, vendas: 114 },
      { mes: '2026-06', faturamento: 24100, meta: 26000, ticketMedio: 236, pa: 1.79, vendas: 102 },
      { mes: '2026-07', faturamento: 26800, meta: 24000, ticketMedio: 244, pa: 1.95, vendas: 110 },
      { mes: '2026-08', faturamento: 25300, meta: 26000, ticketMedio: 258, pa: 2.04, vendas: 98 },
      { mes: '2026-09', faturamento: 26200, meta: 28000, ticketMedio: 236, pa: 1.74, vendas: 111 },
    ],
    celebracoes: [],
    semReconhecimentos: false,
  };
}

// ------------------------------------------------------------ finalização

const ROTULO_INELEGIVEL: Record<MotivoInelegivel, string> = {
  NOVO: 'Você está no período de adaptação de vendedor novo.',
  DESLIGADO: 'Seu cadastro está inativo.',
  TRANSFERIDO: 'Você foi transferida de loja neste mês; volta ao ranking no próximo período.',
  PERIODO_INSUFICIENTE: 'Ainda não há dias suficientes no período para entrar no ranking.',
  EXCECAO: 'Você está fora do ranking por decisão da administração.',
};

const INDICADOR_DA_METRICA: Record<Metrica, IndicadorVendedor> = {
  SCORE: 'SCORE',
  VENDAS: 'VENDAS',
  PERCENTUAL_META: 'PERCENTUAL_META',
  EVOLUCAO: 'EVOLUCAO',
  PA: 'PA',
  TICKET: 'TICKET',
  CONSISTENCIA: 'CONSISTENCIA',
};

export function descreverPremio(p: { tipo: string; nome: string; xp: number; moedas: number; badge: string | null }): string {
  if (p.tipo === 'EMPRESARIAL') return p.nome;
  const partes = [p.xp ? `+${p.xp} XP` : '', p.moedas ? `+${p.moedas} VendaCoins` : '', p.badge ? `badge “${p.nome}”` : ''].filter(Boolean);
  return partes.join(' · ') || p.nome;
}

function competicoesDoEstado(r: Rascunho, elegiveis: Perfil[], lojaId: string): Competicao[] {
  const { estado } = r;
  const lojaNome = (id: string) => estado.lojas.find((l) => l.id === id)?.nome ?? id;
  const nomePessoa = (id: string) => estado.vendedores.find((v) => v.id === id)?.nome ?? id;
  const ordenar = (lista: { id: string; nome: string; valor: number }[]) => [...lista].sort((a, b) => b.valor - a.valor);
  const premios = (ids: string[]) =>
    ids
      .map((id) => estado.premios.find((p) => p.id === id))
      .filter((p): p is NonNullable<typeof p> => Boolean(p))
      .map(descreverPremio)
      .join(' + ') || 'Sem prêmio definido';
  const mapaStatus = { ATIVA: 'ATIVA', PROGRAMADA: 'PROXIMA', ENCERRADA: 'ENCERRADA' } as const;

  return estado.competicoes
    .filter((c) => c.status === 'ATIVA' || c.status === 'PROGRAMADA' || c.status === 'ENCERRADA')
    .map((c) => {
      let participantes: { id: string; nome: string; valor: number }[] = [];
      if (c.status !== 'PROGRAMADA') {
        if (c.tipo === 'LOJA') participantes = r.pontosLojas.map((l) => ({ id: l.lojaId, nome: lojaNome(l.lojaId), valor: l.pontos }));
        else if (c.metrica) {
          const metrica = c.metrica;
          const base = c.escopo === 'MINHA_LOJA' ? elegiveis.filter((p) => p.lojaId === lojaId) : elegiveis;
          participantes = base.map((p) => ({ id: p.id, nome: p.nome, valor: VALOR_METRICA[metrica](p) }));
        } else if (c.valoresDemo) participantes = Object.entries(c.valoresDemo).map(([id, valor]) => ({ id, nome: nomePessoa(id), valor }));
      }
      return {
        id: c.id,
        nome: c.nome,
        tipo: c.tipo,
        formato: c.formato,
        unidade: c.unidade,
        regra: c.regra,
        iniciaEm: c.inicio,
        terminaEm: c.fim,
        status: mapaStatus[c.status as keyof typeof mapaStatus],
        premio: premios(c.premioIds),
        participantes: ordenar(participantes),
        meuId: c.tipo === 'LOJA' ? lojaId : EU,
      };
    });
}

/** Ganhos digitais = soma dos prêmios digitais das frentes que a vendedora venceu (1º lugar ou meta do mês batida). */
function ganhosDaCampanha(estado: EstadoDemo, cad: EstadoDemo['campanhas'][number] | undefined, competicoes: Competicao[], pctMes: number | null) {
  if (!cad) return null;
  let xp = 0;
  let moedas = 0;
  for (const f of cad.frentes) {
    const comp = competicoes.find((c) => c.id === f.refId);
    const venceu = f.mecanismo === 'META_MES' ? pctMes !== null && pctMes >= 100 : Boolean(comp && comp.participantes[0]?.id === comp.meuId);
    const p = estado.premios.find((x) => x.id === f.premioId);
    if (venceu && p && p.tipo === 'DIGITAL') {
      xp += p.xp;
      moedas += p.moedas;
    }
  }
  return { xp, moedas };
}

function campanhasDoEstado(r: Rascunho, competicoes: Competicao[], lojaId: string, metaMes: number | null): Campanha[] {
  const { estado } = r;
  const premio = (id: string | null) => {
    const p = id ? estado.premios.find((x) => x.id === id) : null;
    return p ? descreverPremio(p) : 'Prêmio a definir';
  };
  const posicao = (id: string | null) => {
    const c = competicoes.find((x) => x.id === id);
    const i = c ? c.participantes.findIndex((p) => p.id === c.meuId) : -1;
    return i === -1 ? null : i + 1;
  };
  const pctMesNum = metaMes ? (r.mes.realizado.faturamento / metaMes) * 100 : null;
  const pctMes = pctMesNum !== null ? pct(pctMesNum) : null;
  const participa = (lojas: 'TODAS' | string[]) => lojas === 'TODAS' || lojas.includes(lojaId);

  const ativas: Campanha[] = estado.campanhas
    .filter((c) => c.status === 'ATIVA' && participa(c.lojas))
    .map((c) => ({
      id: c.id,
      nome: c.nome,
      descricao: c.descricao,
      iniciaEm: c.inicio,
      terminaEm: c.fim,
      status: 'ATIVA' as const,
      regras: c.regras,
      frentes: c.frentes.map((f) => {
        const comp = competicoes.find((x) => x.id === f.refId);
        const pos = posicao(f.refId);
        const ehLoja = comp?.tipo === 'LOJA';
        const situacao =
          f.mecanismo === 'META_MES'
            ? pctMes === null
              ? 'Sem meta cadastrada'
              : `Você está em ${pctMes}`
            : f.mecanismo === 'MISSAO'
              ? 'Missão vinculada'
              : pos === null
                ? 'Você não participa'
                : `${ehLoja ? 'Sua loja está' : 'Você está'} em ${pos}º lugar`;
        return { id: f.id, icone: f.icone, titulo: f.titulo, descricao: comp?.nome ?? (f.mecanismo === 'META_MES' ? 'Bater 100% da meta do mês' : '—'), premio: premio(f.premioId), situacao, competicaoId: comp?.id };
      }),
    }));

  const encerradas: Campanha[] = estado.campanhas
    .filter((c) => c.status === 'ENCERRADA' && participa(c.lojas))
    .map((c) => ({
      id: c.id,
      nome: c.nome,
      descricao: c.descricao,
      iniciaEm: c.inicio,
      terminaEm: c.fim,
      status: 'ENCERRADA' as const,
      regras: c.regras,
      frentes: [],
      resultado: (c.resultado ?? []).map((res) => ({ titulo: c.frentes.find((f) => f.id === res.frenteId)?.titulo ?? res.frenteId, vencedor: res.vencedor, premio: res.premio, minhaPosicao: res.minhaPosicao })),
      meusGanhos: c.meusGanhos,
    }));

  if (r.encerrarCampanhaAtiva && ativas[0]) {
    // Cenário "campanha encerrada": a ativa vira resultado final com as posições de agora.
    const a = ativas.shift()!;
    const cad = estado.campanhas.find((c) => c.id === a.id);
    encerradas.unshift({
      ...a,
      status: 'ENCERRADA',
      resultado: a.frentes.map((f) => {
        const ref = cad?.frentes.find((x) => x.id === f.id);
        const comp = competicoes.find((x) => x.id === ref?.refId);
        return { titulo: f.titulo, vencedor: ref?.mecanismo === 'META_MES' ? 'Todas que bateram 100% da meta do mês' : (comp?.participantes[0]?.nome ?? '—'), premio: f.premio, minhaPosicao: ref?.refId ? posicao(ref.refId) : null };
      }),
      meusGanhos: ganhosDaCampanha(estado, cad, competicoes, pctMesNum),
      frentes: [],
    });
  }
  return [...ativas, ...encerradas];
}

function finalizar(r: Rascunho): Fase1Dados {
  const { estado } = r;
  const cadEu = estado.vendedores.find((v) => v.id === EU)!;
  const lojaId = cadEu.lojaId;
  const eu = r.perfis.find((p) => p.id === EU)!;
  const cad = (id: string) => estado.vendedores.find((v) => v.id === id);

  // Metas: vêm do Admin, a menos que o cenário force.
  const metaMes = r.metaMesForcada !== undefined ? r.metaMesForcada : (estado.metas.individuais[EU]?.mensal ?? null);
  const realizadoAteOntem = r.mes.realizado.faturamento - r.hoje.realizado.faturamento;
  const feriado = feriadoHoje(r.agora, estado, lojaId);
  const status: StatusDados = { ...r.status, lojaFechada: r.status.lojaFechada || feriado !== null };
  const metaHoje =
    r.metaHojeForcada !== undefined
      ? r.metaHojeForcada
      : status.lojaFechada || metaMes === null
        ? null
        : metaDiariaVigente(opcoesMetaDiaria(estado, EU, lojaId, r.agora, realizadoAteOntem), estado.metas.distribuicao);
  const diasRestantes = r.diasRestantesForcado !== undefined ? r.diasRestantesForcado : diasValidosRestantes(r.agora, estado, lojaId);

  // Dado atrasado também vem do Admin (Saúde dos dados): só no "agora" padrão do mundo demo.
  if (r.agora === AGORA && status.sincronizadoEm && minutosDesde(status.sincronizadoEm, r.agora) > LIMITE_SYNC_MIN) status.desatualizado = true;

  // Fonte única: o faturamento do mês da vendedora alimenta os rankings.
  eu.vendas = r.mes.realizado.faturamento;
  eu.meta = metaMes ?? 0;
  if (r.mes.realizado.ticketMedio !== null) eu.ticket = Math.round(r.mes.realizado.ticketMedio);
  if (r.mes.realizado.pa !== null) eu.pa = Math.round(r.mes.realizado.pa * 100) / 100;

  // Elegibilidade: cadastro do Admin + período de adaptação do cenário "vendedora nova".
  const ehElegivel = (p: Perfil) => {
    if (p.id === EU && r.novo) return false;
    const c = cad(p.id);
    return Boolean(c && c.status === 'ATIVO' && c.elegivel);
  };
  const elegiveis = r.perfis.filter(ehElegivel);
  const euElegivel = ehElegivel(eu);
  const motivo = r.novo ? ROTULO_INELEGIVEL.NOVO : cadEu.motivoInelegivel ? ROTULO_INELEGIVEL[cadEu.motivoInelegivel] : cadEu.status !== 'ATIVO' ? ROTULO_INELEGIVEL.DESLIGADO : null;
  const daLoja = elegiveis.filter((p) => p.lojaId === lojaId);

  // Indicadores que o Admin liberou (ativos E com fonte confiável/parcial).
  const indicadores = Object.fromEntries(Object.entries(estado.indicadores).map(([k, i]) => [k, i.ativo && i.fonte !== 'SEM_FONTE'])) as Record<IndicadorVendedor, boolean>;
  const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const outros = r.perfis.filter((p) => p.lojaId === lojaId && p.id !== EU);
  let referencia: Fase1Dados['referencia'] =
    r.referenciaOrigem === 'MES'
      ? { ticketMedio: r.mes.realizado.ticketMedio, pa: r.mes.realizado.pa, origem: 'MES' }
      : r.referenciaOrigem === 'LOJA'
        ? { ticketMedio: media(outros.map((p) => p.ticket)), pa: media(outros.map((p) => p.pa)), origem: 'LOJA' }
        : { ticketMedio: null, pa: null, origem: null };
  if (!indicadores.TICKET) referencia = { ...referencia, ticketMedio: null };
  if (!indicadores.PA || !indicadores.PARES) referencia = { ...referencia, pa: null };

  const recordes = r.recordes.map((rec) => {
    if (rec.tipo === 'MELHOR_MES') return { ...rec, atual: r.mes.realizado.faturamento };
    if (rec.tipo === 'MELHOR_DIA') return { ...rec, atual: r.hoje.realizado.faturamento };
    if (rec.tipo === 'MAIOR_SEQUENCIA') return { ...rec, atual: r.sequencia.atual };
    return rec;
  });

  // Missões: progresso do cenário + o que foi simulado na tela ("simular venda").
  const missoes = r.missoes.map((m) => {
    const extra = estado.simulacao.progresso[`${r.cenarioId}:${m.id}`] ?? 0;
    const progresso = Math.min(m.alvo, m.progresso + extra);
    return { ...m, progresso, concluidaEm: m.concluidaEm ?? (progresso >= m.alvo ? r.agora : undefined) };
  });

  const competicoes = r.semCompeticoes ? [] : competicoesDoEstado(r, elegiveis, lojaId);
  const campanhas = r.semCompeticoes ? [] : campanhasDoEstado(r, competicoes, lojaId, metaMes);

  // Reconhecimentos e publicações do Admin viram eventos do feed (respeitando a governança de tipos).
  const nome = (id: string) => cad(id)?.nome.split(' ')[0] ?? id;
  const reconhecimentos = r.semReconhecimentos ? [] : estado.reconhecimentos.filter((x) => x.vendedorId === EU).sort((a, b) => b.quando.localeCompare(a.quando));
  const feedAdmin: EventoFeed[] = r.semReconhecimentos
    ? []
    : [
        ...estado.reconhecimentos
          .filter((x) => x.quando >= '2026-10-22')
          .map((x) => ({ id: `fr-${x.id}`, tipo: 'RECONHECIMENTO' as const, quando: x.quando, icone: '💛', texto: x.vendedorId === EU ? `Você recebeu um reconhecimento: “${x.titulo}”.` : `${nome(x.vendedorId)} recebeu um reconhecimento: “${x.titulo}”.`, meu: x.vendedorId === EU })),
        ...estado.auditoria
          .filter((a) => a.quando >= '2026-10-22' && (a.acao === 'Publicou missão' || a.acao === 'Publicou campanha'))
          .map((a) => ({ id: `fa-${a.id}`, tipo: (a.acao === 'Publicou missão' ? 'MISSAO' : 'COMPETICAO') as EventoFeed['tipo'], quando: a.quando, icone: a.acao === 'Publicou missão' ? '🎯' : '📣', texto: `${a.acao === 'Publicou missão' ? 'Nova missão no ar' : 'Nova campanha no ar'}: ${a.entidade.replace(/^\S+ /, '')}.` })),
      ];
  const feed = [...feedAdmin, ...r.feed].filter((e) => estado.feedTipos[e.tipo]).sort((a, b) => b.quando.localeCompare(a.quando));

  // Créditos gerados na tela (missão concluída por simulação) — sempre pelo "ledger" simulado, nunca editando saldo.
  const creditos = estado.simulacao.creditos.filter((c) => c.id.startsWith(`${r.cenarioId}:`));
  const xpTotal = r.xpTotal + creditos.reduce((a, c) => a + c.xp, 0);
  const moedasSaldo = r.moedas.saldo + creditos.reduce((a, c) => a + c.moedas, 0);

  const dados: Fase1Dados = {
    nivel: { ...calcularNivel(xpTotal), niveis: NIVEIS_V1.map((n) => ({ nivel: n.nivel, nome: n.nome, xpMinimo: n.xpMinimo })) },
    agora: r.agora,
    vendedor: { id: EU, nome: cadEu.nome, primeiroNome: cadEu.nome.split(' ')[0], lojaId, empresa: 'Sapatinho de Luxo', admitidoEm: r.novo ? '2026-10-19' : cadEu.admitidoEm, novo: r.novo },
    lojas: estado.lojas.map((l) => ({ id: l.id, nome: l.nome })),
    pessoas: r.perfis.map(({ id, nome: n, lojaId: lj }) => ({ id, nome: n, lojaId: lj })),
    status,
    hoje: { meta: metaHoje, realizado: r.hoje.realizado },
    mes: { meta: metaMes, realizado: r.mes.realizado, diasTrabalhoRestantes: diasRestantes, diasTrabalhados: r.mes.diasTrabalhados },
    referencia,
    rankings: {
      loja: porMetrica((m) => montarRanking(daLoja, m, 1)),
      geral: porMetrica((m) => montarRanking(elegiveis, m, 2)),
      lojas: r.pontosLojas.filter((l) => estado.rankings.lojaXLoja.lojas.includes(l.lojaId)),
    },
    xp: { total: xpTotal, historico: [...creditos.filter((c) => c.xp).map((c) => ({ id: c.id, quando: c.quando, origem: c.origem, xp: c.xp })), ...r.xpHistorico] },
    moedas: { saldo: moedasSaldo, historico: [...creditos.filter((c) => c.moedas).map((c) => ({ id: c.id, quando: c.quando, origem: c.origem, valor: c.moedas })), ...r.moedas.historico] },
    sequencia: { ...r.sequencia, criterio: 'dias de trabalho seguidos com a meta diária batida' },
    missoes,
    competicoes,
    campanhas,
    campanhaEmDestaque: r.campanhaEmDestaque,
    conquistas: r.conquistas,
    recordes,
    feed,
    reconhecimentos: reconhecimentos.map((x) => ({ id: x.id, quando: x.quando, autor: x.autor, motivo: x.motivo, titulo: x.titulo, mensagem: x.mensagem })),
    historico: r.historico,
    comparavel: { faturamento: 21700, vendas: 92, pares: 160, ticketMedio: 235.9, pa: 1.74, percentualMeta: 77.5 },
    celebracoes: [],
    indicadores,
    metricasRanking: estado.rankings.metricasAtivas.filter((m) => indicadores[INDICADOR_DA_METRICA[m]]),
    metricaCorrida: indicadores[INDICADOR_DA_METRICA[estado.rankings.metricaCorrida]] ? estado.rankings.metricaCorrida : 'SCORE',
    elegibilidade: { elegivel: euElegivel, motivo: euElegivel ? null : motivo },
  };
  dados.conquistas = conquistasDerivadas(dados);
  dados.celebracoes = r.celebracoes.map((c) => (typeof c === 'function' ? c(dados) : c));
  return dados;
}

/** "Quanto falta" das conquistas calculado dos dados — nunca texto fixo. */
const BASE_TICKET_DEMO = 258; // baseline pessoal de ticket (backend: baseline.service)
function conquistasDerivadas(d: Fase1Dados): Conquista[] {
  return d.conquistas.map((c) => {
    if (c.conquistadaEm) return c;
    if (c.codigo === 'STREAK_7') {
      const faltam = Math.max(0, 7 - d.sequencia.atual);
      return { ...c, falta: `faltam ${plural(faltam, 'dia')} de meta batida`, progresso: (d.sequencia.atual / 7) * 100 };
    }
    if (c.codigo === 'TICKET_MASTER' && d.mes.realizado.ticketMedio !== null) {
      return { ...c, falta: `ticket do mês ${reais(d.mes.realizado.ticketMedio)} · sua base ${reais(BASE_TICKET_DEMO)}`, progresso: Math.min(100, (d.mes.realizado.ticketMedio / BASE_TICKET_DEMO) * 100) };
    }
    if (c.codigo === 'MAIOR_EVOLUCAO') {
      const comp = d.competicoes.find((x) => x.tipo === 'EVOLUCAO' && x.status === 'ATIVA');
      const i = comp ? comp.participantes.findIndex((p) => p.id === comp.meuId) : -1;
      return { ...c, falta: i >= 0 && comp ? `você está em ${i + 1}º lugar em “${comp.nome}”` : undefined };
    }
    if (c.codigo === 'DESTAQUE_DA_EQUIPE') {
      const comp = d.competicoes.find((x) => x.tipo === 'LOJA' && x.status === 'ATIVA');
      return { ...c, falta: comp ? `${comp.nome} termina em ${comp.terminaEm.slice(8, 10)}/${comp.terminaEm.slice(5, 7)}` : undefined };
    }
    return c;
  });
}

/** Texto das celebrações de meta, derivado dos dados finais. */
function detalheMetaDia(d: Fase1Dados): string {
  const meta = d.hoje.meta ?? 0;
  const real = d.hoje.realizado.faturamento;
  const marco = proximoMarco(real, meta);
  return `${reais(real)} de ${reais(meta)} — ${pct((real / Math.max(1, meta)) * 100)} da meta de hoje.${marco ? ` Faltam ${reais(marco.faltaReais)} para os ${marco.marco}%.` : ''}`;
}

// ------------------------------------------------------------ cenários

export type ComportamentoCarga = 'normal' | 'lento' | 'erro';

export interface Cenario {
  id: string;
  rotulo: string;
  titulo: string;
  descricao: string;
  grupo: 'jornada' | 'estado';
  carga: ComportamentoCarga;
  ajustar: (r: Rascunho) => void;
}

const missao = (r: Rascunho, id: string) => r.missoes.find((m) => m.id === id);
const perfil = (r: Rascunho, id: string) => r.perfis.find((p) => p.id === id);

function comecoDoDia(r: Rascunho, hora: string) {
  r.agora = `2026-10-22T${hora}:00`;
  r.status.sincronizadoEm = `2026-10-22T${hora.slice(0, 2)}:00:00`;
  r.hoje = { realizado: realizado(0, 0, 0) };
  for (const id of ['m-abertura', 'm-diaria']) {
    const m = missao(r, id);
    if (m) {
      m.progresso = 0;
      m.concluidaEm = undefined;
    }
  }
  r.xpHistorico = r.xpHistorico.filter((x) => !x.quando.startsWith('2026-10-22'));
  r.moedas.historico = r.moedas.historico.filter((x) => !x.quando.startsWith('2026-10-22'));
  r.feed = r.feed.filter((f) => !f.quando.startsWith('2026-10-22'));
}

function vendasDoDia(r: Rascunho, fat: number, vendas: number, pares: number) {
  r.hoje.realizado = realizado(fat, vendas, pares);
  r.mes.realizado = realizado(21686 + fat, 87 + vendas, 156 + pares);
  const d = missao(r, 'm-diaria');
  if (d) {
    d.progresso = Math.min(d.alvo, vendas);
    if (vendas >= d.alvo) d.concluidaEm = '2026-10-22T14:50:00';
  }
}

export const CENARIOS: Cenario[] = [
  {
    id: 'A', rotulo: 'A', titulo: 'Início do dia', grupo: 'jornada', carga: 'normal',
    descricao: '09:20 · nenhuma venda ainda. O mês segue de onde parou ontem.',
    ajustar: (r) => {
      comecoDoDia(r, '09:20');
      r.mes.realizado = realizado(21686, 87, 156);
    },
  },
  { id: 'B', rotulo: 'B', titulo: '76% da meta do dia', grupo: 'jornada', carga: 'normal', descricao: 'Tarde de quinta. R$ 1.514 de R$ 2.000. Situação típica do piloto.', ajustar: () => {} },
  {
    id: 'C', rotulo: 'C', titulo: 'Quase 1º lugar', grupo: 'jornada', carga: 'normal',
    descricao: 'A Júlia está só R$ 90 à frente — uma venda resolve.',
    ajustar: (r) => {
      perfil(r, 'julia')!.vendas = 23290;
      r.feed.unshift({ id: 'fc', tipo: 'POSICAO', quando: '2026-10-22T15:12:00', icone: '⚡', texto: 'Você está a R$ 90,00 do 1º lugar da loja.', meu: true });
    },
  },
  {
    id: 'D', rotulo: 'D', titulo: 'Meta do dia batida', grupo: 'jornada', carga: 'normal',
    descricao: 'R$ 2.180 de R$ 2.000 (109%). A corrida continua rumo aos 110%.',
    ajustar: (r) => {
      vendasDoDia(r, 2180, 9, 16);
      r.celebracoes = [(d) => ({ id: 'cel-d', tipo: 'META_DIA', titulo: 'Meta do dia batida!', detalhe: detalheMetaDia(d), recompensa: REGUA_V1.META_DIARIA_100 })];
    },
  },
  {
    id: 'E', rotulo: 'E', titulo: '110% da meta', grupo: 'jornada', carga: 'normal',
    descricao: 'R$ 2.210 (110%). Próximo marco: 120%.',
    ajustar: (r) => {
      vendasDoDia(r, 2210, 9, 17);
      r.celebracoes = [(d) => ({ id: 'cel-e', tipo: 'META_DIA', titulo: '110% da meta!', detalhe: detalheMetaDia(d), recompensa: REGUA_V1.META_DIARIA_110 })];
    },
  },
  {
    id: 'F', rotulo: 'F', titulo: '120% da meta', grupo: 'jornada', carga: 'normal',
    descricao: 'R$ 2.420 (121%). Marcos 100/110/120 ✓, próximo 150%.',
    ajustar: (r) => {
      vendasDoDia(r, 2420, 10, 19);
      r.celebracoes = [(d) => ({ id: 'cel-f', tipo: 'META_DIA', titulo: '120% da meta!', detalhe: detalheMetaDia(d), recompensa: REGUA_V1.META_DIARIA_120 })];
    },
  },
  {
    id: 'G', rotulo: 'G', titulo: '150% da meta', grupo: 'jornada', carga: 'normal',
    descricao: 'R$ 3.040 no dia — todos os marcos, recorde de dia e badge 150%.',
    ajustar: (r) => {
      vendasDoDia(r, 3040, 12, 23);
      const melhorDia = r.recordes.find((x) => x.tipo === 'MELHOR_DIA')!;
      melhorDia.valor = 3040;
      melhorDia.quando = '2026-10-22';
      r.conquistas = r.conquistas.map((c) => (c.codigo === 'META_150' ? { ...c, conquistadaEm: '2026-10-22', falta: undefined, progresso: undefined } : c));
      r.celebracoes = [{ id: 'cel-g', tipo: 'BADGE', titulo: 'Badge conquistada: Meta 150%', detalhe: 'Você passou de 150% da meta do dia — e fez seu melhor dia.', recompensa: REGUA_V1.META_DIARIA_150 }];
    },
  },
  {
    id: 'H', rotulo: 'H', titulo: 'Último no ranking, evoluindo', grupo: 'jornada', carga: 'normal',
    descricao: '10:05 · 5ª na loja em vendas, mas 1ª em evolução e a R$ 860 do melhor mês.',
    ajustar: (r) => {
      comecoDoDia(r, '10:05');
      r.mes.realizado = realizado(16000, 71, 114);
      r.metaMesForcada = 24000;
      r.historico = r.historico.map((h) => ({ ...h, faturamento: Math.round(h.faturamento * 0.58), meta: 24000, vendas: Math.round(h.vendas * 0.62) }));
      r.historico[4].faturamento = 16860;
      const melhorMes = r.recordes.find((x) => x.tipo === 'MELHOR_MES')!;
      melhorMes.valor = 16860;
      melhorMes.quando = '2026-09-30';
      perfil(r, 'carla')!.vendas = 17200;
      Object.assign(perfil(r, 'ana')!, { evolucao: 13.6, score: 690, tendencia: 0 });
      r.xpTotal = 1500;
      r.missoes = r.missoes.filter((m) => m.id === 'm-ponta').map((m) => ({ ...m, progresso: 0, alvo: 8 }));
    },
  },
  {
    id: 'I', rotulo: 'I', titulo: 'Missão quase concluída', grupo: 'jornada', carga: 'normal',
    descricao: '7 de 8 vendas na missão do dia. Toque em “simular venda” no card para concluir.',
    ajustar: (r) => {
      r.hoje.realizado = realizado(1600, 7, 13);
      r.mes.realizado = realizado(23286, 94, 169);
      const d = missao(r, 'm-diaria');
      if (d) d.progresso = Math.max(0, d.alvo - 1);
    },
  },
  {
    id: 'J', rotulo: 'J', titulo: 'Missão concluída', grupo: 'jornada', carga: 'normal',
    descricao: 'Scarpin da semana concluído: 3 de 3 pares do Ref. 12345.',
    ajustar: (r) => {
      const m = missao(r, 'm-produto');
      if (!m) return;
      m.progresso = m.alvo;
      m.concluidaEm = '2026-10-22T15:15:00';
      r.xpTotal += m.recompensa.xp;
      r.moedas.saldo += m.recompensa.moedas;
      r.xpHistorico.unshift({ id: 'xj', quando: '2026-10-22T15:15:00', origem: `Missão “${m.titulo}”`, xp: m.recompensa.xp });
      r.moedas.historico.unshift({ id: 'cj', quando: '2026-10-22T15:15:00', origem: `Missão “${m.titulo}”`, valor: m.recompensa.moedas });
      r.celebracoes = [{ id: 'cel-j', tipo: 'MISSAO', titulo: 'Missão concluída!', detalhe: `${m.titulo} — objetivo de ${m.alvo} pares atingido.`, recompensa: m.recompensa }];
    },
  },
  {
    id: 'K', rotulo: 'K', titulo: 'Novo nível', grupo: 'jornada', carga: 'normal',
    descricao: 'Passou de 1.800 XP: Ouro → Platina.',
    ajustar: (r) => {
      r.xpTotal = 1840;
      r.xpHistorico.unshift({ id: 'xk', quando: '2026-10-22T15:16:00', origem: 'Meta diária atingida', xp: REGUA_V1.META_DIARIA_100.xp });
      vendasDoDia(r, 2030, 8, 15);
      r.celebracoes = [
        (d) => {
          const n = calcularNivel(d.xp.total);
          return { id: 'cel-k', tipo: 'NIVEL', titulo: `Novo nível: ${n.nome}`, detalhe: `Você chegou a ${d.xp.total.toLocaleString('pt-BR')} XP.${n.proximo ? ` Próximo: ${n.proximo.nome}, com ${n.proximo.xpMinimo.toLocaleString('pt-BR')} XP.` : ''}` };
        },
      ];
    },
  },
  {
    id: 'L', rotulo: 'L', titulo: 'Recorde próximo', grupo: 'jornada', carga: 'normal',
    descricao: 'O melhor mês é R$ 24.060 — faltam R$ 860.',
    ajustar: (r) => {
      const melhorMes = r.recordes.find((x) => x.tipo === 'MELHOR_MES')!;
      melhorMes.valor = 24060;
      r.historico[0].faturamento = 24060;
      r.missoes = r.missoes.filter((m) => m.id === 'm-ponta').map((m) => ({ ...m, progresso: 0, alvo: 10 }));
      perfil(r, 'julia')!.vendas = 25100;
      r.xpTotal = 1500;
    },
  },
  {
    id: 'M', rotulo: 'M', titulo: 'Recorde batido', grupo: 'jornada', carga: 'normal',
    descricao: 'R$ 3.120 hoje: superou o melhor dia (R$ 2.980, em 12/09).',
    ajustar: (r) => {
      vendasDoDia(r, 3120, 12, 24);
      const rec = r.recordes.find((x) => x.tipo === 'MELHOR_DIA')!;
      rec.valor = 3120;
      rec.quando = '2026-10-22';
      r.celebracoes = [(d) => ({ id: 'cel-m', tipo: 'RECORDE', titulo: 'Novo recorde!', detalhe: `Melhor dia da sua história: ${reais(d.hoje.realizado.faturamento)}. O anterior era ${reais(2980)} (12/09).`, recompensa: { xp: 40, moedas: 15 } })];
    },
  },
  {
    id: 'N', rotulo: 'N', titulo: 'Loja quase em 1º', grupo: 'jornada', carga: 'normal',
    descricao: 'Você é a 1ª da loja; a loja está 31 pontos atrás de Santa Cruz.',
    ajustar: (r) => {
      r.pontosLojas = [
        { lojaId: 'santacruz', pontos: 842, posicaoAnterior: 1 },
        { lojaId: 'caruaru', pontos: 811, posicaoAnterior: 3 },
        { lojaId: 'difusora', pontos: 784, posicaoAnterior: 2 },
      ];
      r.mes.realizado = realizado(24100, 96, 174);
      perfil(r, 'ana')!.score = 851;
      r.feed.unshift({ id: 'fn', tipo: 'LOJA', quando: '2026-10-22T15:10:00', icone: '🏬', texto: 'Caruaru Shopping está a 31 pontos da liderança.', meu: true });
      r.celebracoes = [
        (d) => {
          const linhas = [...d.rankings.loja.VENDAS].sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0));
          const segunda = d.pessoas.find((p) => p.id === linhas[1]?.pessoaId);
          return { id: 'cel-n', tipo: 'PRIMEIRO_LUGAR', titulo: 'Você assumiu o 1º lugar da loja', detalhe: `${reais(d.mes.realizado.faturamento)} no mês${segunda ? ` — ${reais((linhas[0].valor ?? 0) - (linhas[1].valor ?? 0))} à frente de ${segunda.nome.split(' ')[0]}` : ''}.` };
        },
      ];
    },
  },
  {
    id: 'O', rotulo: 'O', titulo: 'Vendedora nova', grupo: 'jornada', carga: 'normal',
    descricao: 'Começou há 3 dias. Sem histórico: fora do ranking e estimativa pelo ticket da loja.',
    ajustar: (r) => {
      r.novo = true;
      r.metaHojeForcada = 1500;
      r.metaMesForcada = 9000;
      r.hoje = { realizado: realizado(0, 0, 0) };
      r.mes = { realizado: realizado(1180, 5, 8), diasTrabalhados: 3 };
      r.referenciaOrigem = 'LOJA';
      r.xpTotal = 220;
      r.xpHistorico = [
        { id: 'xo1', quando: '2026-10-21T19:00:00', origem: 'Primeira venda registrada', xp: 20 },
        { id: 'xo2', quando: '2026-10-20T18:00:00', origem: 'Meta diária atingida', xp: REGUA_V1.META_DIARIA_100.xp },
        { id: 'xo3', quando: '2026-10-19T12:00:00', origem: 'Boas-vindas', xp: 100 },
      ];
      r.moedas = { saldo: 75, historico: [{ id: 'co1', quando: '2026-10-20T18:00:00', origem: 'Meta diária atingida', valor: REGUA_V1.META_DIARIA_100.moedas }, { id: 'co2', quando: '2026-10-19T12:00:00', origem: 'Boas-vindas', valor: 25 }] };
      r.sequencia = { atual: 0, maior: 1 };
      r.historico = [];
      r.recordes = [];
      r.conquistas = r.conquistas.map((c) => ({ ...c, conquistadaEm: c.codigo === 'PRIMEIRA_META' ? '2026-10-20' : null, falta: undefined, progresso: undefined }));
      r.missoes = r.missoes.filter((m) => m.id === 'm-diaria').map((m) => ({ ...m, progresso: 0, alvo: 3, titulo: 'Três no dia', descricao: 'Feche 3 vendas hoje.' }));
      Object.assign(perfil(r, 'ana')!, { evolucao: 0, score: 560, consistencia: 1, tendencia: 0 });
    },
  },
  {
    id: 'P', rotulo: 'P', titulo: 'Sem meta cadastrada', grupo: 'jornada', carga: 'normal',
    descricao: 'Sem meta de outubro. Vendas e posição continuam visíveis. (Também acontece se o Admin apagar a meta.)',
    ajustar: (r) => {
      r.metaHojeForcada = null;
      r.metaMesForcada = null;
    },
  },
  {
    id: 'Q', rotulo: 'Q', titulo: 'Sem ticket suficiente', grupo: 'jornada', carga: 'normal',
    descricao: 'Sem ticket confiável: mostra quanto falta em R$, sem converter em vendas.',
    ajustar: (r) => {
      r.referenciaOrigem = 'NENHUMA';
      r.mes.realizado = { ...r.mes.realizado, ticketMedio: null, pa: null };
      r.hoje.realizado = { ...r.hoje.realizado, ticketMedio: null, pa: null };
    },
  },
  {
    id: 'R', rotulo: 'R', titulo: 'Dado desatualizado', grupo: 'jornada', carga: 'normal',
    descricao: 'O ERP não sincroniza desde 11:00. Ranking suspenso até o próximo sync.',
    ajustar: (r) => {
      r.status.sincronizadoEm = '2026-10-22T11:00:00';
      r.status.desatualizado = true;
      r.status.rankingDisponivel = false;
    },
  },
  {
    id: 'S', rotulo: 'S', titulo: 'Campanha ativa', grupo: 'jornada', carga: 'normal',
    descricao: '“Outubro Campeão” em destaque na Home, com a situação em cada frente.',
    ajustar: (r) => {
      r.campanhaEmDestaque = true;
      r.feed.unshift({ id: 'fs', tipo: 'COMPETICAO', quando: '2026-10-22T15:00:00', icone: '📣', texto: 'Faltam 10 dias para o fim do Outubro Campeão.', meu: true });
    },
  },
  {
    id: 'T', rotulo: 'T', titulo: 'Campanha encerrada', grupo: 'jornada', carga: 'normal',
    descricao: '31/10, 22:30 · Outubro Campeão encerrado: resultado, vencedores e o que você ganhou.',
    ajustar: (r) => {
      r.agora = '2026-10-31T22:30:00';
      r.status.sincronizadoEm = '2026-10-31T22:00:00';
      r.hoje.realizado = realizado(2240, 9, 17);
      r.mes.realizado = realizado(31500, 126, 228);
      r.diasRestantesForcado = 0;
      r.mes.diasTrabalhados = 25;
      r.encerrarCampanhaAtiva = true;
      r.missoes = r.missoes.filter((m) => m.id === 'm-ponta' || m.id === 'm-consistencia');
      r.feed = [];
      r.celebracoes = [
        (d) => {
          const camp = d.campanhas.find((c) => c.status === 'ENCERRADA');
          const p = d.mes.meta ? pct((d.mes.realizado.faturamento / d.mes.meta) * 100) : null;
          return { id: 'cel-t', tipo: 'MOEDAS', titulo: `${camp?.nome ?? 'Campanha'} encerrada`, detalhe: p ? `Você fechou o mês com ${p} da meta.` : 'Veja o resultado da campanha.', recompensa: camp?.meusGanhos ?? undefined };
        },
      ];
    },
  },
  // ------------------------------------------------ estados especiais
  { id: 'X1', rotulo: 'X1', titulo: 'Dia de folga', grupo: 'estado', carga: 'normal', descricao: 'Folga na escala. Nada de pressão: só o resumo do mês.', ajustar: (r) => { r.status.diaDeFolga = true; r.hoje = { realizado: realizado(0, 0, 0) }; } },
  { id: 'X2', rotulo: 'X2', titulo: 'Loja fechada', grupo: 'estado', carga: 'normal', descricao: 'Feriado municipal — a loja não abre. (Também acontece se o Admin cadastrar feriado em 22/10.)', ajustar: (r) => { r.status.lojaFechada = true; r.hoje = { realizado: realizado(0, 0, 0) }; } },
  { id: 'X3', rotulo: 'X3', titulo: 'Erro ao carregar', grupo: 'estado', carga: 'erro', descricao: 'Falha de rede/servidor: erro neutro com “Tentar de novo”.', ajustar: () => {} },
  { id: 'X4', rotulo: 'X4', titulo: 'Carregando (rede lenta)', grupo: 'estado', carga: 'lento', descricao: 'Simula 2,5 s de carregamento a cada tela.', ajustar: () => {} },
  { id: 'X5', rotulo: 'X5', titulo: 'Offline', grupo: 'estado', carga: 'normal', descricao: 'Sem internet: último dado conhecido, sinalizado.', ajustar: (r) => { r.status.offline = true; } },
  { id: 'X6', rotulo: 'X6', titulo: 'Sem missões nem competições', grupo: 'estado', carga: 'normal', descricao: 'Nada ativo — estados vazios.', ajustar: (r) => { r.missoes = []; r.semCompeticoes = true; r.feed = []; r.semReconhecimentos = true; } },
];

export const CENARIO_PADRAO = 'B';

export function buscarCenario(id: string): Cenario {
  return CENARIOS.find((c) => c.id === id) ?? CENARIOS.find((c) => c.id === CENARIO_PADRAO)!;
}

/** Monta a visão da vendedora: estado do Admin + situação do cenário. Determinístico. */
export function montarCenario(id: string, estado: EstadoDemo = estadoInicial()): Fase1Dados {
  const cenario = buscarCenario(id);
  const r = rascunhoBase(structuredClone(estado), cenario.id);
  cenario.ajustar(r);
  return finalizar(r);
}

/** Celebrações para "experimentar" a qualquer momento. */
export const CELEBRACOES_DEMO: Celebracao[] = [
  { id: 'demo-meta', tipo: 'META_DIA', titulo: 'Meta do dia batida!', detalhe: 'R$ 2.180,00 de R$ 2.000,00 — 109% da meta de hoje.', recompensa: REGUA_V1.META_DIARIA_100 },
  { id: 'demo-110', tipo: 'META_DIA', titulo: '110% da meta!', detalhe: 'R$ 2.210,00 hoje. Próximo marco: 120%.', recompensa: REGUA_V1.META_DIARIA_110 },
  { id: 'demo-120', tipo: 'META_DIA', titulo: '120% da meta!', detalhe: 'R$ 2.420,00 hoje. Próximo marco: 150%.', recompensa: REGUA_V1.META_DIARIA_120 },
  { id: 'demo-150', tipo: 'META_DIA', titulo: '150% da meta!', detalhe: 'Todos os marcos do dia conquistados.', recompensa: REGUA_V1.META_DIARIA_150 },
  { id: 'demo-primeiro', tipo: 'PRIMEIRO_LUGAR', titulo: 'Você assumiu o 1º lugar da loja', detalhe: 'R$ 24.100,00 no mês — R$ 580,00 à frente da Júlia.' },
  { id: 'demo-recorde', tipo: 'RECORDE', titulo: 'Novo recorde!', detalhe: 'Melhor dia da sua história: R$ 3.120,00.', recompensa: { xp: 40, moedas: 15 } },
  { id: 'demo-nivel', tipo: 'NIVEL', titulo: 'Novo nível: Platina', detalhe: 'Próximo: Diamante, com 3.500 XP.' },
  { id: 'demo-missao', tipo: 'MISSAO', titulo: 'Missão concluída!', detalhe: 'Scarpin da semana — 3 pares do Ref. 12345.', recompensa: { xp: 30, moedas: 10 } },
  { id: 'demo-badge', tipo: 'BADGE', titulo: 'Badge conquistada: Meta 150%', detalhe: 'Você passou de 150% da meta do dia.', recompensa: REGUA_V1.META_DIARIA_150 },
  { id: 'demo-moedas', tipo: 'MOEDAS', titulo: '+40 VendaCoins', detalhe: '2º lugar no Sprint da Semana.' },
];
