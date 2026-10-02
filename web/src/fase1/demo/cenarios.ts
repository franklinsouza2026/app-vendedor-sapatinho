/**
 * ============================================================================
 *  DADOS DE DEMONSTRAÇÃO — FASE 1 (MOCK CONTROLADO)
 * ============================================================================
 *
 * Único lugar do frontend onde números da Fase 1 são escritos à mão. Nenhum
 * componente tem número fixo: as telas recebem `Fase1Dados` e derivam o resto
 * (`dominio/estimativas.ts`, `dominio/alvos.ts`).
 *
 * Coerência garantida por construção:
 *   - a vendedora (Ana) existe nos perfis; o faturamento do mês dela nos
 *     rankings é SEMPRE o mesmo de `mes.realizado` (sincronizado em `finalizar`);
 *   - posições, distâncias e "Próximo Alvo" são calculados, nunca digitados;
 *   - recordes "em disputa" usam o realizado atual.
 *
 * Data fixa: quinta-feira, 22/10/2026. Escolhida para que a corrida do mês
 * faça sentido (R$ 23.200 de R$ 30.000 com 8 dias de trabalho restantes) e a
 * campanha "Outubro Campeão" esteja em andamento.
 *
 * Para trocar por dados reais: substituir `montarCenario()` por um carregador
 * que monta `Fase1Dados` a partir da API (ver docs/FASE-1-MAPA-FRONTEND-BACKEND.md).
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
  LinhaRankingBruta,
  Metrica,
  MesHistorico,
  Missao,
  PeriodoMes,
  PeriodoMeta,
  Pessoa,
  Recorde,
  Reconhecimento,
  StatusDados,
} from '../dominio/tipos';
import { pct } from '../formato';

// ------------------------------------------------------------ elenco fixo

const LOJAS = [
  { id: 'caruaru', nome: 'Caruaru Shopping' },
  { id: 'santacruz', nome: 'Santa Cruz' },
  { id: 'difusora', nome: 'Difusora' },
];

export const EU = 'ana';

/** Perfil mensal de cada vendedor — base de todos os rankings. `tendencia` = quantas posições subiu desde o período anterior. */
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

function perfisBase(): Perfil[] {
  const p = (id: string, nome: string, lojaId: string, vendas: number, meta: number, evolucao: number, pa: number, ticket: number, consistencia: number, score: number, tendencia: number): Perfil => ({ id, nome, lojaId, vendas, meta, evolucao, pa, ticket, consistencia, score, tendencia });
  return [
    p('ana', 'Ana Beatriz Lima', 'caruaru', 23200, 30000, 6.1, 1.8, 249, 9, 812, 1),
    p('julia', 'Júlia Ramos', 'caruaru', 23520, 28000, 2.4, 1.65, 262, 11, 836, 0),
    p('maria', 'Maria Clara Souza', 'caruaru', 21900, 28000, -1.8, 1.92, 231, 8, 790, -1),
    p('joao', 'João Pedro Alves', 'caruaru', 19850, 26000, 8.9, 1.71, 228, 7, 771, 0),
    p('carla', 'Carla Menezes', 'caruaru', 16400, 26000, 11.4, 1.58, 205, 5, 702, 0),
    p('bruna', 'Bruna Torres', 'santacruz', 26100, 30000, 3.2, 1.88, 271, 12, 861, 0),
    p('rafaela', 'Rafaela Nunes', 'santacruz', 24800, 28000, 5.0, 1.74, 255, 12, 849, 1),
    p('lucas', 'Lucas Ferreira', 'santacruz', 21000, 26000, -0.6, 1.62, 240, 9, 781, -1),
    p('patricia', 'Patrícia Gomes', 'santacruz', 18900, 26000, 4.1, 2.05, 214, 6, 760, 0),
    p('tais', 'Taís Moura', 'santacruz', 15200, 24000, 9.7, 1.69, 199, 4, 690, 1),
    p('camila', 'Camila Duarte', 'difusora', 25300, 30000, 1.1, 1.77, 266, 10, 842, -1),
    p('renata', 'Renata Lopes', 'difusora', 23900, 28000, 0.4, 1.81, 247, 10, 818, -1),
    p('diego', 'Diego Martins', 'difusora', 23400, 28000, 2.9, 1.6, 259, 8, 798, 0),
    p('fernanda', 'Fernanda Rocha', 'difusora', 17800, 24000, 7.5, 1.95, 210, 7, 744, 0),
    p('livia', 'Lívia Barros', 'difusora', 14100, 24000, 12.8, 1.52, 188, 3, 655, 0),
  ];
}

const VALOR_METRICA: Record<Metrica, (p: Perfil) => number> = {
  SCORE: (p) => p.score,
  VENDAS: (p) => p.vendas,
  PERCENTUAL_META: (p) => Math.round((p.vendas / p.meta) * 1000) / 10,
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

/** Rascunho editável por cenário. `finalizar()` transforma em `Fase1Dados` coerente. */
interface Rascunho {
  agora: string;
  admitidoEm: string;
  novo: boolean;
  status: StatusDados;
  hoje: PeriodoMeta;
  mes: PeriodoMes;
  referenciaOrigem: 'MES' | 'LOJA' | 'NENHUMA';
  perfis: Perfil[];
  pontosLojas: { lojaId: string; pontos: number; posicaoAnterior: number | null }[];
  xpTotal: number;
  xpHistorico: EventoXp[];
  moedas: { saldo: number; historico: EventoMoedas[] };
  sequencia: { atual: number; maior: number };
  missoes: Missao[];
  competicoesExtras: Competicao[];
  semCompeticoes: boolean;
  campanha: Campanha | null;
  conquistas: Conquista[];
  recordes: Recorde[];
  feed: EventoFeed[];
  reconhecimentos: Reconhecimento[];
  historico: MesHistorico[];
  celebracoes: Celebracao[];
}

const AGORA = '2026-10-22T15:20:00';
const INICIO_MES = '2026-10-01T00:00:00';
const FIM_MES = '2026-10-31T23:59:00';
const FIM_SEMANA = '2026-10-24T22:00:00';

function realizado(faturamento: number, vendas: number, pares: number) {
  return {
    faturamento,
    vendas,
    pares,
    ticketMedio: vendas > 0 ? faturamento / vendas : null,
    pa: vendas > 0 ? pares / vendas : null,
  };
}

function missoesBase(): Missao[] {
  const r = (xp: number, moedas: number) => ({ xp, moedas });
  return [
    { id: 'm-diaria', tipo: 'DIARIA', titulo: 'Oito no dia', descricao: 'Feche 8 vendas hoje.', unidade: 'venda', progresso: 6, alvo: 8, recompensa: r(20, 5), terminaEm: '2026-10-22T22:00:00' },
    { id: 'm-produto', tipo: 'PRODUTO_SEMANA', titulo: 'Scarpin da semana', descricao: 'Venda 3 pares do Scarpin Ref. 12345 até sábado.', unidade: 'par', progresso: 1, alvo: 3, recompensa: r(30, 10), terminaEm: FIM_SEMANA, produtos: [{ referencia: '12345', nome: 'Scarpin Verniz Nude 7cm' }] },
    { id: 'm-semanal', tipo: 'SEMANAL', titulo: 'Combo da semana', descricao: 'Faça 5 vendas com 2 pares ou mais.', unidade: 'venda', progresso: 3, alvo: 5, recompensa: r(40, 15), terminaEm: FIM_SEMANA },
    { id: 'm-categoria', tipo: 'CATEGORIA', titulo: 'Semana das bolsas', descricao: 'Inclua uma bolsa em 4 vendas.', unidade: 'venda', progresso: 1, alvo: 4, recompensa: r(30, 10), terminaEm: FIM_SEMANA },
    { id: 'm-performance', tipo: 'PERFORMANCE', titulo: 'Acima do seu ticket', descricao: 'Feche 3 dias da semana com ticket médio acima de R$ 260 (seu ticket do mês é a referência).', unidade: 'dia', progresso: 1, alvo: 3, recompensa: r(40, 15), terminaEm: FIM_SEMANA },
    { id: 'm-consistencia', tipo: 'CONSISTENCIA', titulo: 'Sequência de ouro', descricao: 'Bata a meta diária 5 dias seguidos.', unidade: 'dia', progresso: 4, alvo: 5, recompensa: r(50, 20), terminaEm: FIM_MES },
    {
      id: 'm-ponta',
      tipo: 'PONTA_ESTOQUE',
      titulo: 'Ponta de estoque — rasteiras',
      descricao: 'Venda 6 pares da seleção de rasteiras com grade quebrada.',
      unidade: 'par',
      progresso: 2,
      alvo: 6,
      recompensa: r(35, 15),
      terminaEm: FIM_MES,
      produtos: [
        { referencia: '20811', nome: 'Rasteira Tiras Caramelo' },
        { referencia: '20814', nome: 'Rasteira Trançada Off-white' },
        { referencia: '20902', nome: 'Rasteira Metalizada Ouro' },
      ],
    },
    { id: 'm-abertura', tipo: 'DIARIA', titulo: 'Primeira venda do dia', descricao: 'Feche a primeira venda antes das 12h.', unidade: 'venda', progresso: 1, alvo: 1, recompensa: r(10, 5), terminaEm: '2026-10-22T12:00:00', concluidaEm: '2026-10-22T10:42:00' },
  ];
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

function rascunhoBase(): Rascunho {
  return {
    agora: AGORA,
    admitidoEm: '2025-11-03',
    novo: false,
    status: { sincronizadoEm: '2026-10-22T15:00:00', desatualizado: false, rankingDisponivel: true, diaDeFolga: false, lojaFechada: false, offline: false },
    hoje: { meta: 2000, realizado: realizado(1514, 6, 11) },
    mes: { meta: 30000, realizado: realizado(23200, 93, 167), diasTrabalhoRestantes: 8, diasTrabalhados: 17 },
    referenciaOrigem: 'MES',
    perfis: perfisBase(),
    // ⚠️ Pontos Loja × Loja são ilustrativos — a fórmula do score entre lojas NÃO está decidida.
    pontosLojas: [
      { lojaId: 'caruaru', pontos: 842, posicaoAnterior: 2 },
      { lojaId: 'santacruz', pontos: 811, posicaoAnterior: 1 },
      { lojaId: 'difusora', pontos: 784, posicaoAnterior: 3 },
    ],
    xpTotal: 1640,
    xpHistorico: [
      { id: 'x1', quando: '2026-10-22T10:42:00', origem: 'Missão “Primeira venda do dia”', xp: 10 },
      { id: 'x2', quando: '2026-10-21T19:10:00', origem: 'Meta diária atingida', xp: 50 },
      { id: 'x3', quando: '2026-10-21T19:10:00', origem: '110% da meta diária', xp: 20 },
      { id: 'x4', quando: '2026-10-20T18:30:00', origem: 'Sequência de 3 dias', xp: 30 },
      { id: 'x5', quando: '2026-10-19T18:50:00', origem: 'Meta diária atingida', xp: 50 },
      { id: 'x6', quando: '2026-10-17T12:00:00', origem: 'Missão “Combo da semana” (semana anterior)', xp: 40 },
      { id: 'x7', quando: '2026-10-15T18:00:00', origem: 'Melhora no PA', xp: 25 },
    ],
    moedas: {
      saldo: 340,
      historico: [
        { id: 'c1', quando: '2026-10-22T10:42:00', origem: 'Missão “Primeira venda do dia”', valor: 5 },
        { id: 'c2', quando: '2026-10-21T19:10:00', origem: 'Meta diária atingida', valor: 20 },
        { id: 'c3', quando: '2026-10-20T18:30:00', origem: 'Sequência de 3 dias', valor: 15 },
        { id: 'c4', quando: '2026-10-17T12:00:00', origem: 'Missão “Combo da semana”', valor: 15 },
        { id: 'c5', quando: '2026-10-10T22:00:00', origem: 'Sprint da Semana — 2º lugar', valor: 40 },
        { id: 'c6', quando: '2026-10-03T14:00:00', origem: 'Ajuste por cancelamento de venda', valor: -5 },
      ],
    },
    sequencia: { atual: 4, maior: 9 },
    missoes: missoesBase(),
    competicoesExtras: [],
    semCompeticoes: false,
    campanha: null, // montada em finalizar() a partir das competições
    conquistas: conquistasBase(),
    recordes: recordesBase(),
    feed: [
      { id: 'f1', quando: '2026-10-22T15:05:00', icone: '🎯', texto: 'Rafaela (Santa Cruz) bateu 100% da meta de hoje.' },
      { id: 'f2', quando: '2026-10-22T14:40:00', icone: '⬆️', texto: 'Você subiu para #2 na loja.', meu: true },
      { id: 'f3', quando: '2026-10-22T13:12:00', icone: '🚀', texto: 'Maria quebrou o recorde pessoal de PA.' },
      { id: 'f4', quando: '2026-10-22T11:30:00', icone: '🏬', texto: 'Caruaru Shopping assumiu a liderança da Batalha das Lojas.', meu: true },
      { id: 'f5', quando: '2026-10-21T19:20:00', icone: '🔥', texto: 'João chegou a 5 dias seguidos de meta.' },
      { id: 'f6', quando: '2026-10-19T09:00:00', icone: '🏁', texto: 'Começou a competição “Sprint da Semana”.' },
    ],
    reconhecimentos: [
      { id: 'r1', quando: '2026-10-18T10:00:00', autor: 'Administração Sapatinho de Luxo', titulo: 'Atendimento que vira fidelidade', mensagem: 'Três clientes citaram seu nome na pesquisa de satisfação da semana. Obrigada, Ana!' },
      { id: 'r2', quando: '2026-09-30T18:00:00', autor: 'Administração Sapatinho de Luxo', titulo: 'Pódio de setembro', mensagem: '2º lugar no Sprint de Setembro. Parabéns pela consistência.' },
    ],
    historico: [
      { mes: '2026-05', faturamento: 27450, meta: 26000, ticketMedio: 241, pa: 1.86, vendas: 114 },
      { mes: '2026-06', faturamento: 24100, meta: 26000, ticketMedio: 236, pa: 1.79, vendas: 102 },
      { mes: '2026-07', faturamento: 26800, meta: 24000, ticketMedio: 244, pa: 1.95, vendas: 110 },
      { mes: '2026-08', faturamento: 25300, meta: 26000, ticketMedio: 258, pa: 2.04, vendas: 98 },
      { mes: '2026-09', faturamento: 26200, meta: 28000, ticketMedio: 236, pa: 1.74, vendas: 111 },
    ],
    celebracoes: [],
  };
}

// ------------------------------------------------------------ finalização

function competicoesBase(r: Rascunho): Competicao[] {
  const nome = (id: string) => r.perfis.find((p) => p.id === id)!.nome.split(' ')[0];
  const ordenar = (lista: { id: string; nome: string; valor: number }[]) => [...lista].sort((a, b) => b.valor - a.valor);
  const daLoja = r.perfis.filter((p) => p.lojaId === 'caruaru');
  const lojaNome = (id: string) => LOJAS.find((l) => l.id === id)!.nome;
  return [
    {
      id: 'c-corrida', nome: 'Corrida de Outubro', tipo: 'VENDEDOR', formato: 'MENSAL', unidade: 'percentual',
      regra: 'Maior % da própria meta do mês. Todas as lojas.', iniciaEm: INICIO_MES, terminaEm: FIM_MES, status: 'ATIVA',
      premio: 'Troféu + 300 VendaCoins para o 1º · 150 para 2º e 3º', meuId: EU,
      participantes: ordenar(r.perfis.map((p) => ({ id: p.id, nome: p.nome, valor: VALOR_METRICA.PERCENTUAL_META(p) }))),
    },
    {
      id: 'c-sprint', nome: 'Sprint da Semana', tipo: 'VENDEDOR', formato: 'SEMANAL', unidade: 'vendas',
      regra: 'Mais vendas fechadas de segunda a sábado. Só a sua loja.', iniciaEm: '2026-10-19T09:00:00', terminaEm: FIM_SEMANA, status: 'ATIVA',
      premio: '+100 XP · +40 VendaCoins', meuId: EU,
      participantes: ordenar(daLoja.map((p) => ({ id: p.id, nome: p.nome, valor: { ana: 21, julia: 23, maria: 18, joao: 17, carla: 12 }[p.id] ?? 10 }))),
    },
    {
      id: 'c-salto', nome: 'Desafio do Salto', tipo: 'CATEGORIA', formato: 'ESPECIAL', unidade: 'pares',
      regra: 'Mais pares de salto alto (acima de 5 cm) vendidos no mês. Todas as lojas.', iniciaEm: '2026-10-10T09:00:00', terminaEm: FIM_MES, status: 'ATIVA',
      premio: 'Badge “Salto de Ouro” + 120 VendaCoins', meuId: EU,
      participantes: ordenar([
        { id: 'camila', nome: 'Camila Duarte', valor: 34 }, { id: 'ana', nome: 'Ana Beatriz Lima', valor: 31 }, { id: 'bruna', nome: 'Bruna Torres', valor: 29 },
        { id: 'maria', nome: 'Maria Clara Souza', valor: 27 }, { id: 'renata', nome: 'Renata Lopes', valor: 22 }, { id: 'patricia', nome: 'Patrícia Gomes', valor: 21 },
      ]),
    },
    {
      id: 'c-lojas', nome: 'Batalha das Lojas', tipo: 'LOJA', formato: 'MENSAL', unidade: 'pontos',
      regra: 'Pontuação coletiva da loja no mês. Fórmula em definição — pontos ilustrativos.', iniciaEm: INICIO_MES, terminaEm: FIM_MES, status: 'ATIVA',
      premio: 'Café da manhã da equipe + badge “Destaque da Equipe”', meuId: 'caruaru',
      participantes: ordenar(r.pontosLojas.map((l) => ({ id: l.lojaId, nome: lojaNome(l.lojaId), valor: l.pontos }))),
    },
    {
      id: 'c-cresceu', nome: 'Quem Mais Cresceu', tipo: 'EVOLUCAO', formato: 'MENSAL', unidade: 'pp',
      regra: 'Maior crescimento do % da meta contra o próprio histórico. Quem está começando também pode vencer.', iniciaEm: INICIO_MES, terminaEm: FIM_MES, status: 'ATIVA',
      premio: 'Badge “Maior Evolução” + 150 VendaCoins', meuId: EU,
      participantes: ordenar(r.perfis.map((p) => ({ id: p.id, nome: p.nome, valor: p.evolucao }))),
    },
    {
      id: 'c-duelo', nome: `Duelo: ${nome('ana')} × ${nome('julia')}`, tipo: 'DUELO', formato: 'SEMANAL', unidade: 'pares',
      regra: 'Quem vender mais pares na semana. Desafio aceito pelas duas.', iniciaEm: '2026-10-19T09:00:00', terminaEm: FIM_SEMANA, status: 'ATIVA',
      premio: '+50 XP para a vencedora', meuId: EU,
      participantes: ordenar([{ id: 'ana', nome: 'Ana Beatriz Lima', valor: 38 }, { id: 'julia', nome: 'Júlia Ramos', valor: 41 }]),
    },
    {
      id: 'c-black', nome: 'Aquecimento Black Friday', tipo: 'VENDEDOR', formato: 'ESPECIAL', unidade: 'vendas',
      regra: 'Mais vendas de 01/11 a 27/11. Todas as lojas.', iniciaEm: '2026-11-01T09:00:00', terminaEm: '2026-11-27T22:00:00', status: 'PROXIMA',
      premio: 'Vale-compras para os 3 primeiros', meuId: EU, participantes: [],
    },
    {
      id: 'c-set', nome: 'Sprint de Setembro', tipo: 'VENDEDOR', formato: 'MENSAL', unidade: 'vendas',
      regra: 'Mais vendas no mês. Só a sua loja.', iniciaEm: '2026-09-01T09:00:00', terminaEm: '2026-09-30T22:00:00', status: 'ENCERRADA',
      premio: 'Troféu + 200 VendaCoins', meuId: EU,
      participantes: [{ id: 'julia', nome: 'Júlia Ramos', valor: 118 }, { id: 'ana', nome: 'Ana Beatriz Lima', valor: 111 }, { id: 'maria', nome: 'Maria Clara Souza', valor: 104 }],
    },
  ];
}

function campanhaBase(competicoes: Competicao[], r: Rascunho): Campanha {
  const posicao = (id: string) => {
    const c = competicoes.find((x) => x.id === id);
    const i = c ? c.participantes.findIndex((p) => p.id === c.meuId) : -1;
    return i === -1 ? '—' : `#${i + 1}`;
  };
  const pctMes = r.mes.meta ? pct((r.mes.realizado.faturamento / r.mes.meta) * 100) : null;
  return {
    id: 'outubro-campeao',
    nome: 'Outubro Campeão',
    descricao: 'O programa de incentivo do mês. Cada frente tem o próprio prêmio — dá para ganhar em mais de uma.',
    iniciaEm: INICIO_MES,
    terminaEm: FIM_MES,
    frentes: [
      { id: 'top', icone: '🏆', titulo: 'Top vendedor', descricao: 'Corrida de Outubro (% da meta)', premio: 'Troféu + 300 VendaCoins', situacao: `Você está em ${posicao('c-corrida')}` },
      { id: 'evolucao', icone: '🌱', titulo: 'Maior evolução', descricao: 'Quem Mais Cresceu', premio: '150 VendaCoins', situacao: `Você está em ${posicao('c-cresceu')}` },
      { id: 'meta', icone: '🎯', titulo: 'Meta batida', descricao: 'Bater 100% da meta do mês', premio: '+200 XP · +80 VendaCoins', situacao: pctMes === null ? 'Sem meta cadastrada' : `Você está em ${pctMes}` },
      { id: 'loja', icone: '🏬', titulo: 'Loja campeã', descricao: 'Batalha das Lojas', premio: 'Café da manhã da equipe', situacao: `Sua loja está em ${posicao('c-lojas')}` },
      { id: 'semanal', icone: '🔥', titulo: 'Desafio semanal', descricao: 'Sprint da Semana', premio: '+100 XP · +40 VendaCoins', situacao: `Você está em ${posicao('c-sprint')}` },
    ],
  };
}

function finalizar(r: Rascunho): Fase1Dados {
  // Fonte única: o faturamento do mês da vendedora alimenta os rankings.
  const eu = r.perfis.find((p) => p.id === EU)!;
  eu.vendas = r.mes.realizado.faturamento;
  if (r.mes.meta !== null) eu.meta = r.mes.meta;
  if (r.mes.realizado.ticketMedio !== null) eu.ticket = Math.round(r.mes.realizado.ticketMedio);
  if (r.mes.realizado.pa !== null) eu.pa = Math.round(r.mes.realizado.pa * 100) / 100;

  const daLoja = r.perfis.filter((p) => p.lojaId === eu.lojaId);
  // ⚠️ REGRA NÃO CONGELADA: vendedor novo fica fora dos rankings no período
  // de adaptação (evita estrear em último por falta de dias). Prazo a definir.
  const elegiveis = (lista: Perfil[]) => (r.novo ? lista.filter((p) => p.id !== EU) : lista);
  const media = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

  const referencia =
    r.referenciaOrigem === 'MES'
      ? { ticketMedio: r.mes.realizado.ticketMedio, pa: r.mes.realizado.pa, origem: 'MES' as const }
      : r.referenciaOrigem === 'LOJA'
        ? { ticketMedio: media(daLoja.filter((p) => p.id !== EU).map((p) => p.ticket)), pa: media(daLoja.filter((p) => p.id !== EU).map((p) => p.pa)), origem: 'LOJA' as const }
        : { ticketMedio: null, pa: null, origem: null };

  const recordes = r.recordes.map((rec) => {
    switch (rec.tipo) {
      case 'MELHOR_MES':
        return { ...rec, atual: r.mes.realizado.faturamento };
      case 'MELHOR_DIA':
        return { ...rec, atual: r.hoje.realizado.faturamento };
      case 'MAIOR_SEQUENCIA':
        return { ...rec, atual: r.sequencia.atual };
      default:
        return rec;
    }
  });

  const competicoes = r.semCompeticoes ? [] : [...competicoesBase(r), ...r.competicoesExtras];
  const campanha = r.semCompeticoes ? null : (r.campanha ?? campanhaBase(competicoes, r));

  const lojaDoEu = LOJAS.find((l) => l.id === eu.lojaId)!;
  return {
    agora: r.agora,
    vendedor: { id: eu.id, nome: eu.nome, primeiroNome: eu.nome.split(' ')[0], lojaId: lojaDoEu.id, empresa: 'Sapatinho de Luxo', admitidoEm: r.admitidoEm, novo: r.novo },
    lojas: LOJAS,
    pessoas: r.perfis.map(({ id, nome, lojaId }) => ({ id, nome, lojaId })),
    status: r.status,
    hoje: r.hoje,
    mes: r.mes,
    referencia,
    rankings: {
      loja: porMetrica((m) => montarRanking(elegiveis(daLoja), m, 1)),
      geral: porMetrica((m) => montarRanking(elegiveis(r.perfis), m, 2)),
      lojas: r.pontosLojas,
    },
    xp: { total: r.xpTotal, historico: r.xpHistorico },
    moedas: r.moedas,
    sequencia: { ...r.sequencia, criterio: 'dias de trabalho seguidos com a meta diária batida' },
    missoes: r.missoes,
    competicoes,
    campanha,
    conquistas: r.conquistas,
    recordes,
    feed: r.feed,
    reconhecimentos: r.reconhecimentos,
    historico: r.historico,
    comparavel: { faturamento: 21700, vendas: 92, pares: 160, ticketMedio: 235.9, pa: 1.74, percentualMeta: 77.5 },
    celebracoes: r.celebracoes,
  };
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

const missao = (r: Rascunho, id: string) => r.missoes.find((m) => m.id === id)!;
const perfil = (r: Rascunho, id: string) => r.perfis.find((p) => p.id === id)!;
const zerarHoje = () => ({ meta: 2000, realizado: realizado(0, 0, 0) });

export const CENARIOS: Cenario[] = [
  {
    id: 'A', rotulo: 'A', titulo: 'Começando o dia', grupo: 'jornada', carga: 'normal',
    descricao: '09:20 · nenhuma venda ainda hoje. O mês segue de onde parou ontem.',
    ajustar: (r) => {
      r.agora = '2026-10-22T09:20:00';
      r.status.sincronizadoEm = '2026-10-22T09:00:00';
      r.hoje = zerarHoje();
      r.mes.realizado = realizado(21686, 87, 156);
      missao(r, 'm-diaria').progresso = 0;
      const ab = missao(r, 'm-abertura');
      ab.progresso = 0;
      delete ab.concluidaEm;
      r.feed = r.feed.filter((f) => !f.quando.startsWith('2026-10-22'));
    },
  },
  { id: 'B', rotulo: 'B', titulo: '76% da meta do dia', grupo: 'jornada', carga: 'normal', descricao: 'Tarde de quinta. R$ 1.514 de R$ 2.000. Situação típica do piloto.', ajustar: () => {} },
  {
    id: 'C', rotulo: 'C', titulo: 'Quase assumindo o #1', grupo: 'jornada', carga: 'normal',
    descricao: 'A Júlia está só R$ 90 à frente — uma venda resolve.',
    ajustar: (r) => {
      perfil(r, 'julia').vendas = 23290;
      r.feed.unshift({ id: 'fc', quando: '2026-10-22T15:12:00', icone: '⚡', texto: 'Você está a R$ 90 do #1 da loja.', meu: true });
    },
  },
  {
    id: 'D', rotulo: 'D', titulo: 'Meta do dia batida', grupo: 'jornada', carga: 'normal',
    descricao: 'R$ 2.180 de R$ 2.000 (109%). A corrida continua rumo aos 110%.',
    ajustar: (r) => {
      r.hoje.realizado = realizado(2180, 9, 16);
      r.mes.realizado = realizado(23866, 96, 172);
      missao(r, 'm-diaria').progresso = 8;
      missao(r, 'm-diaria').concluidaEm = '2026-10-22T15:02:00';
      r.celebracoes = [{ id: 'cel-d', tipo: 'META_DIA', titulo: 'Meta do dia batida!', detalhe: 'R$ 2.180 de R$ 2.000 — 109%. Faltam R$ 20 para os 110%.', recompensa: { xp: 50, moedas: 20 } }];
    },
  },
  {
    id: 'E', rotulo: 'E', titulo: 'Acima da meta: 123%', grupo: 'jornada', carga: 'normal',
    descricao: 'Marcos de 100%, 110% e 120% atingidos. Próximo: 150%.',
    ajustar: (r) => {
      r.hoje.realizado = realizado(2460, 10, 19);
      r.mes.realizado = realizado(24146, 97, 175);
      missao(r, 'm-diaria').progresso = 8;
      missao(r, 'm-diaria').concluidaEm = '2026-10-22T14:10:00';
    },
  },
  {
    id: 'E2', rotulo: 'E+', titulo: 'Todos os marcos: 152%', grupo: 'jornada', carga: 'normal',
    descricao: 'R$ 3.040 no dia. 100/110/120/150% atingidos — e é recorde de dia.',
    ajustar: (r) => {
      r.hoje.realizado = realizado(3040, 12, 23);
      r.mes.realizado = realizado(24726, 99, 179);
      missao(r, 'm-diaria').progresso = 8;
      missao(r, 'm-diaria').concluidaEm = '2026-10-22T13:30:00';
      const melhorDia = r.recordes.find((x) => x.tipo === 'MELHOR_DIA')!;
      melhorDia.valor = 3040;
      melhorDia.quando = '2026-10-22';
      r.conquistas = r.conquistas.map((c) => (c.codigo === 'META_150' ? { ...c, conquistadaEm: '2026-10-22', falta: undefined, progresso: undefined } : c));
      r.celebracoes = [{ id: 'cel-e2', tipo: 'BADGE', titulo: 'Badge conquistada: Meta 150%', detalhe: 'Você passou de 150% da meta do dia.', recompensa: { xp: 60, moedas: 25 } }];
    },
  },
  {
    id: 'F', rotulo: 'F', titulo: 'Último no ranking, perto do recorde', grupo: 'jornada', carga: 'normal',
    descricao: '10:05 · 5ª na loja em vendas, mas a R$ 860 do melhor mês da vida e entre as que mais cresceram.',
    ajustar: (r) => {
      r.agora = '2026-10-22T10:05:00';
      r.status.sincronizadoEm = '2026-10-22T10:00:00';
      r.hoje = zerarHoje();
      r.mes.realizado = realizado(16000, 71, 114);
      r.mes.meta = 24000;
      r.historico = r.historico.map((h) => ({ ...h, faturamento: Math.round(h.faturamento * 0.58), meta: 24000, vendas: Math.round(h.vendas * 0.62) }));
      r.historico[4].faturamento = 16860;
      const melhorMes = r.recordes.find((x) => x.tipo === 'MELHOR_MES')!;
      melhorMes.valor = 16860;
      melhorMes.quando = '2026-09-30';
      perfil(r, 'carla').vendas = 17200;
      const ana = perfil(r, 'ana');
      ana.evolucao = 13.6;
      ana.score = 690;
      ana.tendencia = 0;
      r.xpTotal = 1500;
      r.missoes = r.missoes.filter((m) => m.id === 'm-ponta');
      missao(r, 'm-ponta').progresso = 0;
      missao(r, 'm-ponta').alvo = 8;
      r.feed = r.feed.filter((f) => !f.quando.startsWith('2026-10-22'));
    },
  },
  {
    id: 'G', rotulo: 'G', titulo: 'Missão quase concluída', grupo: 'jornada', carga: 'normal',
    descricao: '7 de 8 vendas na missão do dia. Falta 1.',
    ajustar: (r) => {
      r.hoje.realizado = realizado(1600, 7, 13);
      r.mes.realizado = realizado(23286, 94, 169);
      missao(r, 'm-diaria').progresso = 7;
    },
  },
  {
    id: 'H', rotulo: 'H', titulo: 'Missão concluída', grupo: 'jornada', carga: 'normal',
    descricao: 'Produto da Semana concluído: 3 de 3 pares do Scarpin Ref. 12345.',
    ajustar: (r) => {
      const m = missao(r, 'm-produto');
      m.progresso = 3;
      m.concluidaEm = '2026-10-22T15:15:00';
      r.xpTotal += 30;
      r.moedas.saldo += 10;
      r.xpHistorico.unshift({ id: 'xh', quando: '2026-10-22T15:15:00', origem: 'Missão “Scarpin da semana”', xp: 30 });
      r.moedas.historico.unshift({ id: 'ch', quando: '2026-10-22T15:15:00', origem: 'Missão “Scarpin da semana”', valor: 10 });
      r.celebracoes = [
        { id: 'cel-h', tipo: 'MISSAO', titulo: 'Missão concluída!', detalhe: 'Scarpin da semana — 3 pares do Scarpin Ref. 12345.', recompensa: { xp: 30, moedas: 10 } },
      ];
    },
  },
  {
    id: 'I', rotulo: 'I', titulo: 'Novo nível', grupo: 'jornada', carga: 'normal',
    descricao: 'Passou de 1.800 XP: Ouro → Platina.',
    ajustar: (r) => {
      r.xpTotal = 1815;
      r.xpHistorico.unshift({ id: 'xi', quando: '2026-10-22T15:16:00', origem: 'Meta diária atingida', xp: 50 });
      r.hoje.realizado = realizado(2030, 8, 15);
      r.mes.realizado = realizado(23716, 95, 171);
      r.celebracoes = [{ id: 'cel-i', tipo: 'NIVEL', titulo: 'Novo nível: Platina', detalhe: 'Você chegou a 1.815 XP. Próximo: Diamante, com 3.500 XP.' }];
    },
  },
  {
    id: 'J', rotulo: 'J', titulo: 'Novo recorde', grupo: 'jornada', carga: 'normal',
    descricao: 'R$ 3.120 hoje: superou o melhor dia (R$ 2.980, em 12/09).',
    ajustar: (r) => {
      r.hoje.realizado = realizado(3120, 12, 24);
      r.mes.realizado = realizado(24806, 99, 180);
      const rec = r.recordes.find((x) => x.tipo === 'MELHOR_DIA')!;
      rec.valor = 3120;
      rec.quando = '2026-10-22';
      r.celebracoes = [{ id: 'cel-j', tipo: 'RECORDE', titulo: 'Novo recorde!', detalhe: 'Melhor dia da sua história: R$ 3.120. O anterior era R$ 2.980 (12/09).', recompensa: { xp: 40, moedas: 15 } }];
    },
  },
  {
    id: 'K', rotulo: 'K', titulo: 'Loja quase na liderança', grupo: 'jornada', carga: 'normal',
    descricao: 'Você é #1 da loja; a loja está 24 pontos atrás de Santa Cruz.',
    ajustar: (r) => {
      r.pontosLojas = [
        { lojaId: 'santacruz', pontos: 848, posicaoAnterior: 1 },
        { lojaId: 'caruaru', pontos: 824, posicaoAnterior: 3 },
        { lojaId: 'difusora', pontos: 801, posicaoAnterior: 2 },
      ];
      r.mes.realizado = realizado(24100, 96, 174);
      perfil(r, 'ana').score = 851;
      r.feed.unshift({ id: 'fk', quando: '2026-10-22T15:10:00', icone: '🏬', texto: 'Caruaru Shopping está a 24 pontos da liderança.', meu: true });
      r.celebracoes = [{ id: 'cel-k', tipo: 'PRIMEIRO_LUGAR', titulo: 'Você assumiu o #1 da loja', detalhe: 'R$ 24.100 no mês — R$ 580 à frente da Júlia.' }];
    },
  },
  {
    id: 'L', rotulo: 'L', titulo: 'Vendedora nova', grupo: 'jornada', carga: 'normal',
    descricao: 'Começou há 3 dias. Sem histórico próprio: as estimativas usam o ticket da loja.',
    ajustar: (r) => {
      r.novo = true;
      r.admitidoEm = '2026-10-19';
      r.hoje = { meta: 1500, realizado: realizado(0, 0, 0) };
      r.mes = { meta: 9000, realizado: realizado(1180, 5, 8), diasTrabalhoRestantes: 8, diasTrabalhados: 3 };
      r.referenciaOrigem = 'LOJA';
      r.xpTotal = 220;
      r.xpHistorico = [
        { id: 'xl1', quando: '2026-10-21T19:00:00', origem: 'Primeira venda registrada', xp: 50 },
        { id: 'xl2', quando: '2026-10-20T18:00:00', origem: 'Meta diária atingida', xp: 50 },
        { id: 'xl3', quando: '2026-10-19T12:00:00', origem: 'Boas-vindas', xp: 120 },
      ];
      r.moedas = { saldo: 45, historico: [{ id: 'cl1', quando: '2026-10-20T18:00:00', origem: 'Meta diária atingida', valor: 20 }, { id: 'cl2', quando: '2026-10-19T12:00:00', origem: 'Boas-vindas', valor: 25 }] };
      r.sequencia = { atual: 0, maior: 1 };
      r.historico = [];
      r.recordes = [];
      r.conquistas = r.conquistas.map((c) => ({ ...c, conquistadaEm: c.codigo === 'PRIMEIRA_META' ? '2026-10-20' : null, falta: undefined, progresso: undefined }));
      r.reconhecimentos = [{ id: 'rl', quando: '2026-10-19T12:00:00', autor: 'Administração Sapatinho de Luxo', titulo: 'Bem-vinda, Ana!', mensagem: 'Que bom ter você na equipe de Caruaru. Aqui você acompanha sua meta, sua evolução e suas conquistas.' }];
      r.missoes = r.missoes.filter((m) => m.id === 'm-diaria');
      missao(r, 'm-diaria').progresso = 0;
      missao(r, 'm-diaria').alvo = 3;
      missao(r, 'm-diaria').titulo = 'Três no dia';
      missao(r, 'm-diaria').descricao = 'Feche 3 vendas hoje.';
      const ana = perfil(r, 'ana');
      ana.evolucao = 0;
      ana.score = 560;
      ana.consistencia = 1;
      ana.tendencia = 0;
    },
  },
  {
    id: 'M', rotulo: 'M', titulo: 'Sem meta cadastrada', grupo: 'jornada', carga: 'normal',
    descricao: 'A loja ainda não lançou metas de outubro. Vendas e posição continuam visíveis.',
    ajustar: (r) => {
      r.hoje.meta = null;
      r.mes.meta = null;
    },
  },
  {
    id: 'N', rotulo: 'N', titulo: 'Sem dados para estimar', grupo: 'jornada', carga: 'normal',
    descricao: 'Sem ticket médio confiável: o app mostra quanto falta em R$, sem converter em vendas.',
    ajustar: (r) => {
      r.referenciaOrigem = 'NENHUMA';
      r.mes.realizado = { ...r.mes.realizado, ticketMedio: null, pa: null };
      r.hoje.realizado = { ...r.hoje.realizado, ticketMedio: null, pa: null };
      r.mes.diasTrabalhoRestantes = null;
    },
  },
  // ------------------------------------------------ estados especiais
  {
    id: 'O', rotulo: 'O', titulo: 'Dia de folga', grupo: 'estado', carga: 'normal',
    descricao: 'Folga na escala. Nada de pressão: só o resumo do mês.',
    ajustar: (r) => {
      r.status.diaDeFolga = true;
      r.hoje = zerarHoje();
    },
  },
  {
    id: 'P', rotulo: 'P', titulo: 'Loja fechada', grupo: 'estado', carga: 'normal',
    descricao: 'Feriado municipal — a loja não abre hoje.',
    ajustar: (r) => {
      r.status.lojaFechada = true;
      r.hoje = { meta: null, realizado: realizado(0, 0, 0) };
    },
  },
  {
    id: 'Q', rotulo: 'Q', titulo: 'Ranking indisponível · dado desatualizado', grupo: 'estado', carga: 'normal',
    descricao: 'O ERP não sincroniza desde 11:00. Ranking suspenso até o próximo sync.',
    ajustar: (r) => {
      r.status.sincronizadoEm = '2026-10-22T11:00:00';
      r.status.desatualizado = true;
      r.status.rankingDisponivel = false;
    },
  },
  { id: 'R', rotulo: 'R', titulo: 'Erro ao carregar', grupo: 'estado', carga: 'erro', descricao: 'Falha de rede/servidor. Mostra a tela de erro com “Tentar de novo”.', ajustar: () => {} },
  { id: 'S', rotulo: 'S', titulo: 'Carregando (rede lenta)', grupo: 'estado', carga: 'lento', descricao: 'Simula 2,5 s de carregamento a cada tela.', ajustar: () => {} },
  {
    id: 'T', rotulo: 'T', titulo: 'Offline', grupo: 'estado', carga: 'normal',
    descricao: 'Sem internet: mostra o último dado conhecido, sinalizado.',
    ajustar: (r) => {
      r.status.offline = true;
    },
  },
  {
    id: 'U', rotulo: 'U', titulo: 'Sem missões nem competições', grupo: 'estado', carga: 'normal',
    descricao: 'Nada ativo no momento — estados vazios.',
    ajustar: (r) => {
      r.missoes = [];
      r.semCompeticoes = true;
      r.feed = [];
      r.reconhecimentos = [];
    },
  },
];

export const CENARIO_PADRAO = 'B';

export function buscarCenario(id: string): Cenario {
  return CENARIOS.find((c) => c.id === id) ?? CENARIOS.find((c) => c.id === CENARIO_PADRAO)!;
}

/** Monta a foto de dados de um cenário. Determinístico: mesma entrada, mesma saída. */
export function montarCenario(id: string): Fase1Dados {
  const r = rascunhoBase();
  buscarCenario(id).ajustar(r);
  return finalizar(r);
}

/** Celebrações disponíveis para "experimentar" a qualquer momento, independente do cenário. */
export const CELEBRACOES_DEMO: Celebracao[] = [
  { id: 'demo-meta', tipo: 'META_DIA', titulo: 'Meta do dia batida!', detalhe: 'R$ 2.180 de R$ 2.000 — 109%.', recompensa: { xp: 50, moedas: 20 } },
  { id: 'demo-primeiro', tipo: 'PRIMEIRO_LUGAR', titulo: 'Você assumiu o #1 da loja', detalhe: 'R$ 24.100 no mês — R$ 580 à frente da Júlia.' },
  { id: 'demo-recorde', tipo: 'RECORDE', titulo: 'Novo recorde!', detalhe: 'Melhor dia da sua história: R$ 3.120.', recompensa: { xp: 40, moedas: 15 } },
  { id: 'demo-nivel', tipo: 'NIVEL', titulo: 'Novo nível: Platina', detalhe: 'Próximo: Diamante, com 3.500 XP.' },
  { id: 'demo-moedas', tipo: 'MOEDAS', titulo: '+40 VendaCoins', detalhe: '2º lugar no Sprint da Semana.' },
  { id: 'demo-missao', tipo: 'MISSAO', titulo: 'Missão concluída!', detalhe: 'Scarpin da semana — 3 pares do Scarpin Ref. 12345.', recompensa: { xp: 30, moedas: 10 } },
  { id: 'demo-badge', tipo: 'BADGE', titulo: 'Badge conquistada: Meta 150%', detalhe: 'Você passou de 150% da meta do dia.', recompensa: { xp: 60, moedas: 25 } },
];
