/**
 * ============================================================================
 *  ESTADO DE DEMONSTRAÇÃO DO ADMIN — FASE 1 (MOCK CONTROLADO E PERSISTENTE)
 * ============================================================================
 *
 * Tudo o que o Admin configura vive aqui: pessoas, lojas, metas, calendário,
 * indicadores, rankings, elegibilidade, produtos, missões, competições,
 * campanhas, premiações, reconhecimentos, governança do feed e auditoria.
 *
 *   ADMIN altera o estado  →  `montarCenario(cenario, estado)`  →  VENDEDOR recebe
 *
 * Persistido em localStorage (só existe na árvore /fase1, que só existe em dev
 * ou com VITE_FASE1_DEMO=true). Na etapa de conexão, cada coleção vira um
 * endpoint — ver docs/FASE-1-MAPA-FRONTEND-BACKEND.md.
 */
import type { Metrica, TipoMissao } from '../dominio/tipos';

// ------------------------------------------------------------------ tipos

export type StatusVendedor = 'ATIVO' | 'PENDENTE' | 'BLOQUEADO' | 'DESLIGADO';
export type MotivoInelegivel = 'NOVO' | 'DESLIGADO' | 'TRANSFERIDO' | 'PERIODO_INSUFICIENTE' | 'EXCECAO';

export interface VendedorCad {
  id: string;
  nome: string;
  lojaId: string;
  matricula: string;
  status: StatusVendedor;
  admitidoEm: string;
  vinculoErp: 'VERIFICADO' | 'PENDENTE';
  elegivel: boolean;
  motivoInelegivel: MotivoInelegivel | null;
  /** Exceção manual: sempre com motivo (auditada). */
  excecao: string | null;
}

export interface LojaCad {
  id: string;
  nome: string;
  codigo: string;
  status: 'ATIVA' | 'INATIVA';
  ultimaSync: string;
  /** Meta da LOJA no mês — conferida contra a soma das metas individuais. */
  metaMes: number;
}

export interface MetaIndividual {
  mensal: number | null;
  /** Meta diária digitada (usada quando a distribuição é MANUAL). */
  diariaManual: number | null;
}

export type DistribuicaoDiaria = 'MANUAL' | 'UNIFORME' | 'DIAS_VALIDOS';

export type Indicador = 'VENDAS' | 'QTD_VENDAS' | 'PARES' | 'TICKET' | 'PA' | 'PERCENTUAL_META' | 'SCORE' | 'EVOLUCAO' | 'CONSISTENCIA' | 'CONVERSAO';

export interface ConfigIndicador {
  ativo: boolean;
  fonte: 'CONFIAVEL' | 'PARCIAL' | 'SEM_FONTE';
  nota: string;
}

export type StatusCiclo = 'RASCUNHO' | 'PROGRAMADA' | 'ATIVA' | 'ENCERRADA' | 'ARQUIVADA' | 'CANCELADA';

export interface Produto {
  referencia: string;
  nome: string;
  categoria: string;
  preco: number;
  foto: string; // emoji no protótipo — foto real vem do cadastro de produtos
}

export interface MissaoCad {
  id: string;
  nome: string;
  tipo: TipoMissao;
  template: string | null;
  descricao: string;
  unidade: 'venda' | 'par' | 'dia' | 'reais';
  alvo: number;
  xp: number;
  moedas: number;
  premioId: string | null;
  lojas: 'TODAS' | string[];
  inicio: string;
  fim: string;
  status: StatusCiclo;
  produtos: string[];
  regras: string;
  /** Progresso simulado da vendedora de demonstração. */
  progressoDemo: number;
}

// Sem 'DUELO': desafio direto entre vendedores está fora da Fase 1 (ver dominio/tipos.ts).
export type TipoCompeticaoCad = 'VENDEDOR' | 'LOJA' | 'EVOLUCAO' | 'CATEGORIA';

export interface CompeticaoCad {
  id: string;
  nome: string;
  tipo: TipoCompeticaoCad;
  formato: 'MENSAL' | 'SEMANAL' | 'ESPECIAL';
  /** Quando há métrica, a classificação é calculada dos perfis; senão usa `valoresDemo`. */
  metrica: Metrica | null;
  unidade: 'vendas' | 'pares' | 'pontos' | 'percentual' | 'pp';
  valoresDemo: Record<string, number> | null;
  escopo: 'MINHA_LOJA' | 'TODAS';
  regra: string;
  inicio: string;
  fim: string;
  status: StatusCiclo;
  premioIds: string[];
}

export interface FrenteCampanha {
  id: string;
  icone: string;
  titulo: string;
  mecanismo: 'COMPETICAO' | 'META_MES' | 'MISSAO';
  refId: string | null;
  premioId: string | null;
}

export interface ResultadoCampanha {
  frenteId: string;
  vencedor: string;
  premio: string;
  /** Posição final da vendedora de demonstração (ou da loja dela). */
  minhaPosicao: number | null;
}

export interface CampanhaCad {
  id: string;
  nome: string;
  descricao: string;
  objetivo: string;
  inicio: string;
  fim: string;
  status: StatusCiclo;
  lojas: 'TODAS' | string[];
  frentes: FrenteCampanha[];
  regras: string;
  resultado: ResultadoCampanha[] | null;
  /** Ganhos digitais da vendedora de demonstração (campanha encerrada). */
  meusGanhos: { xp: number; moedas: number } | null;
}

export interface Premio {
  id: string;
  nome: string;
  tipo: 'DIGITAL' | 'EMPRESARIAL';
  xp: number;
  moedas: number;
  badge: string | null;
  categoria: 'DINHEIRO' | 'VALE' | 'PRODUTO' | 'EXPERIENCIA' | 'OUTRO' | null;
  /** Informativo/administrativo. Nada é pago pelo sistema. */
  descricao: string;
}

export type MotivoReconhecimento = 'RESULTADO' | 'EVOLUCAO' | 'INICIATIVA' | 'EQUIPE' | 'SUPERACAO' | 'OUTRO';

export interface ReconhecimentoCad {
  id: string;
  vendedorId: string;
  motivo: MotivoReconhecimento;
  titulo: string;
  mensagem: string;
  quando: string;
  autor: string;
}

export type TipoFeed = 'POSICAO' | 'META' | 'RECORDE' | 'MISSAO' | 'CONQUISTA' | 'LOJA' | 'COMPETICAO' | 'RECONHECIMENTO';

export interface EventoAuditoria {
  id: string;
  quando: string;
  usuario: string;
  acao: string;
  entidade: string;
  antes: string | null;
  depois: string | null;
  motivo: string | null;
}

export interface EstadoDemo {
  versao: 2;
  vendedores: VendedorCad[];
  lojas: LojaCad[];
  metas: { referencia: string; individuais: Record<string, MetaIndividual>; distribuicao: DistribuicaoDiaria };
  calendario: { abreDomingo: boolean; feriados: { id: string; data: string; nome: string; lojas: 'TODAS' | string[] }[]; especiais: { id: string; data: string; nome: string }[] };
  indicadores: Record<Indicador, ConfigIndicador>;
  rankings: { metricasAtivas: Metrica[]; metricaCorrida: Metrica; lojaXLoja: { status: 'AGUARDANDO_REGRA' | 'ATIVO'; formula: 'PCT_META_COLETIVA' | 'MEDIA_SCORE' | 'EVOLUCAO_COLETIVA' | null; lojas: string[] } };
  produtos: Produto[];
  missoes: MissaoCad[];
  competicoes: CompeticaoCad[];
  campanhas: CampanhaCad[];
  premios: Premio[];
  reconhecimentos: ReconhecimentoCad[];
  feedTipos: Record<TipoFeed, boolean>;
  auditoria: EventoAuditoria[];
  /** Interação do protótipo: progresso extra simulado por "cenário:missão" e créditos gerados. */
  simulacao: { progresso: Record<string, number>; creditos: { id: string; quando: string; origem: string; xp: number; moedas: number }[] };
}

// ------------------------------------------------------------------ valores iniciais

const INICIO_MES = '2026-10-01T00:00:00';
const FIM_MES = '2026-10-31T23:59:00';
const FIM_SEMANA = '2026-10-24T22:00:00';

function v(id: string, nome: string, lojaId: string, matricula: string, extra: Partial<VendedorCad> = {}): VendedorCad {
  return { id, nome, lojaId, matricula, status: 'ATIVO', admitidoEm: '2025-03-10', vinculoErp: 'VERIFICADO', elegivel: true, motivoInelegivel: null, excecao: null, ...extra };
}

export function estadoInicial(): EstadoDemo {
  return {
    versao: 2,
    vendedores: [
      v('ana', 'Ana Beatriz Lima', 'caruaru', 'VEND101', { admitidoEm: '2025-11-03' }),
      v('julia', 'Júlia Ramos', 'caruaru', 'VEND102'),
      v('maria', 'Maria Clara Souza', 'caruaru', 'VEND103'),
      v('joao', 'João Pedro Alves', 'caruaru', 'VEND104'),
      v('carla', 'Carla Menezes', 'caruaru', 'VEND105'),
      v('bruna', 'Bruna Torres', 'santacruz', 'VEND201'),
      v('rafaela', 'Rafaela Nunes', 'santacruz', 'VEND202'),
      v('lucas', 'Lucas Ferreira', 'santacruz', 'VEND203', { vinculoErp: 'PENDENTE' }),
      v('patricia', 'Patrícia Gomes', 'santacruz', 'VEND204'),
      v('tais', 'Taís Moura', 'santacruz', 'VEND205'),
      v('camila', 'Camila Duarte', 'difusora', 'VEND301'),
      v('renata', 'Renata Lopes', 'difusora', 'VEND302'),
      v('diego', 'Diego Martins', 'difusora', 'VEND303'),
      v('fernanda', 'Fernanda Rocha', 'difusora', 'VEND304', { vinculoErp: 'PENDENTE' }),
      v('livia', 'Lívia Barros', 'difusora', 'VEND305'),
      v('sofia', 'Sofia Andrade', 'difusora', 'VEND306', { status: 'PENDENTE', admitidoEm: '2026-10-19', elegivel: false, motivoInelegivel: 'NOVO' }),
    ],
    lojas: [
      { id: 'caruaru', nome: 'Caruaru Shopping', codigo: 'LJ-CAR', status: 'ATIVA', ultimaSync: '2026-10-22T15:16:00', metaMes: 138000 },
      { id: 'santacruz', nome: 'Santa Cruz', codigo: 'LJ-STC', status: 'ATIVA', ultimaSync: '2026-10-22T15:14:00', metaMes: 134000 },
      { id: 'difusora', nome: 'Difusora', codigo: 'LJ-DIF', status: 'ATIVA', ultimaSync: '2026-10-22T12:20:00', metaMes: 134000 },
    ],
    metas: {
      referencia: '2026-10',
      distribuicao: 'MANUAL',
      individuais: {
        ana: { mensal: 30000, diariaManual: 2000 },
        julia: { mensal: 28000, diariaManual: 1900 },
        maria: { mensal: 28000, diariaManual: 1900 },
        joao: { mensal: 26000, diariaManual: 1750 },
        carla: { mensal: 26000, diariaManual: 1750 },
        bruna: { mensal: 30000, diariaManual: 2000 },
        rafaela: { mensal: 28000, diariaManual: 1900 },
        lucas: { mensal: 26000, diariaManual: 1750 },
        patricia: { mensal: 26000, diariaManual: 1750 },
        tais: { mensal: 24000, diariaManual: 1600 },
        camila: { mensal: 30000, diariaManual: 2000 },
        renata: { mensal: 28000, diariaManual: 1900 },
        diego: { mensal: 28000, diariaManual: 1900 },
        fernanda: { mensal: 24000, diariaManual: 1600 },
        livia: { mensal: 24000, diariaManual: 1600 },
        sofia: { mensal: null, diariaManual: null },
      },
    },
    calendario: {
      abreDomingo: false,
      feriados: [
        { id: 'fer-1', data: '2026-11-02', nome: 'Finados', lojas: 'TODAS' },
        { id: 'fer-2', data: '2026-11-15', nome: 'Proclamação da República', lojas: 'TODAS' },
      ],
      especiais: [{ id: 'esp-1', data: '2026-11-27', nome: 'Black Friday — horário estendido' }],
    },
    indicadores: {
      VENDAS: { ativo: true, fonte: 'CONFIAVEL', nota: 'Faturamento do ERP, sync horário.' },
      QTD_VENDAS: { ativo: true, fonte: 'CONFIAVEL', nota: 'Contagem de cupons do vendedor.' },
      PARES: { ativo: true, fonte: 'PARCIAL', nota: 'Derivado de PA × vendas até existir campo próprio.' },
      TICKET: { ativo: true, fonte: 'CONFIAVEL', nota: 'Faturamento ÷ vendas.' },
      PA: { ativo: true, fonte: 'CONFIAVEL', nota: 'Peças ÷ vendas.' },
      PERCENTUAL_META: { ativo: true, fonte: 'CONFIAVEL', nota: 'Depende de meta cadastrada.' },
      SCORE: { ativo: true, fonte: 'CONFIAVEL', nota: 'Fórmula v1: meta 40%, evolução 20%, PA 15%, ticket 15%, consistência 10%.' },
      EVOLUCAO: { ativo: true, fonte: 'CONFIAVEL', nota: 'Contra a baseline pessoal.' },
      CONSISTENCIA: { ativo: true, fonte: 'PARCIAL', nota: 'Dias com meta batida — depende do calendário.' },
      CONVERSAO: { ativo: false, fonte: 'SEM_FONTE', nota: 'Não há registro de atendimentos sem venda.' },
    },
    rankings: {
      metricasAtivas: ['SCORE', 'VENDAS', 'PERCENTUAL_META', 'EVOLUCAO', 'PA', 'TICKET', 'CONSISTENCIA'],
      metricaCorrida: 'VENDAS',
      lojaXLoja: { status: 'AGUARDANDO_REGRA', formula: null, lojas: ['caruaru', 'santacruz', 'difusora'] },
    },
    produtos: [
      { referencia: '12345', nome: 'Scarpin Verniz Nude 7cm', categoria: 'Salto', preco: 289.9, foto: '👠' },
      { referencia: '12410', nome: 'Scarpin Bico Fino Preto 9cm', categoria: 'Salto', preco: 309.9, foto: '👠' },
      { referencia: '20811', nome: 'Rasteira Tiras Caramelo', categoria: 'Rasteira', preco: 129.9, foto: '🩴' },
      { referencia: '20814', nome: 'Rasteira Trançada Off-white', categoria: 'Rasteira', preco: 139.9, foto: '🩴' },
      { referencia: '20902', nome: 'Rasteira Metalizada Ouro', categoria: 'Rasteira', preco: 119.9, foto: '🩴' },
      { referencia: '31007', nome: 'Bolsa Tiracolo Couro Caramelo', categoria: 'Bolsa', preco: 349.9, foto: '👜' },
      { referencia: '41120', nome: 'Tênis Casual Branco', categoria: 'Tênis', preco: 259.9, foto: '👟' },
    ],
    missoes: [
      { id: 'm-diaria', nome: 'Oito no dia', tipo: 'DIARIA', template: 'SPRINT_META', descricao: 'Feche 8 vendas hoje.', unidade: 'venda', alvo: 8, xp: 20, moedas: 5, premioId: null, lojas: 'TODAS', inicio: '2026-10-22T09:00:00', fim: '2026-10-22T22:00:00', status: 'ATIVA', produtos: [], regras: 'Conta toda venda finalizada no dia.', progressoDemo: 6 },
      { id: 'm-produto', nome: 'Scarpin da semana', tipo: 'PRODUTO_SEMANA', template: 'PRODUTO_SEMANA', descricao: 'Venda 3 pares do Scarpin Ref. 12345 até sábado.', unidade: 'par', alvo: 3, xp: 30, moedas: 10, premioId: null, lojas: 'TODAS', inicio: '2026-10-19T09:00:00', fim: FIM_SEMANA, status: 'ATIVA', produtos: ['12345'], regras: 'Conta par vendido da referência, qualquer numeração.', progressoDemo: 1 },
      { id: 'm-semanal', nome: 'Combo da semana', tipo: 'SEMANAL', template: 'DESAFIO_PA', descricao: 'Faça 5 vendas com 2 pares ou mais.', unidade: 'venda', alvo: 5, xp: 40, moedas: 15, premioId: null, lojas: 'TODAS', inicio: '2026-10-19T09:00:00', fim: FIM_SEMANA, status: 'ATIVA', produtos: [], regras: 'Venda com 2+ pares no mesmo cupom.', progressoDemo: 3 },
      { id: 'm-categoria', nome: 'Semana das bolsas', tipo: 'CATEGORIA', template: 'CATEGORIA', descricao: 'Inclua uma bolsa em 4 vendas.', unidade: 'venda', alvo: 4, xp: 30, moedas: 10, premioId: null, lojas: 'TODAS', inicio: '2026-10-19T09:00:00', fim: FIM_SEMANA, status: 'ATIVA', produtos: ['31007'], regras: 'Cupom com ao menos 1 item da categoria Bolsa.', progressoDemo: 1 },
      { id: 'm-performance', nome: 'Acima do seu ticket', tipo: 'PERFORMANCE', template: 'SUPERACAO', descricao: 'Feche 3 dias da semana com ticket médio acima de R$ 260.', unidade: 'dia', alvo: 3, xp: 40, moedas: 15, premioId: null, lojas: 'TODAS', inicio: '2026-10-19T09:00:00', fim: FIM_SEMANA, status: 'ATIVA', produtos: [], regras: 'Ticket do dia > R$ 260 (seu ticket do mês é a referência).', progressoDemo: 1 },
      { id: 'm-consistencia', nome: 'Sequência de ouro', tipo: 'CONSISTENCIA', template: 'CONSISTENCIA', descricao: 'Bata a meta diária 5 dias seguidos.', unidade: 'dia', alvo: 5, xp: 50, moedas: 20, premioId: null, lojas: 'TODAS', inicio: INICIO_MES, fim: FIM_MES, status: 'ATIVA', produtos: [], regras: 'Dias de trabalho válidos do calendário.', progressoDemo: 4 },
      { id: 'm-ponta', nome: 'Ponta de estoque — rasteiras', tipo: 'PONTA_ESTOQUE', template: 'PONTA_ESTOQUE', descricao: 'Venda 6 pares da seleção de rasteiras com grade quebrada.', unidade: 'par', alvo: 6, xp: 35, moedas: 15, premioId: null, lojas: 'TODAS', inicio: INICIO_MES, fim: FIM_MES, status: 'ATIVA', produtos: ['20811', '20814', '20902'], regras: 'Qualquer par das referências selecionadas.', progressoDemo: 2 },
      { id: 'm-abertura', nome: 'Primeira venda do dia', tipo: 'DIARIA', template: 'SPRINT_META', descricao: 'Feche a primeira venda antes das 12h.', unidade: 'venda', alvo: 1, xp: 10, moedas: 5, premioId: null, lojas: 'TODAS', inicio: '2026-10-22T09:00:00', fim: '2026-10-22T12:00:00', status: 'ATIVA', produtos: [], regras: 'Primeiro cupom do vendedor antes das 12h.', progressoDemo: 1 },
      { id: 'm-tenis', nome: 'Tênis em novembro', tipo: 'CATEGORIA', template: 'CATEGORIA', descricao: 'Venda 5 pares de tênis na primeira semana de novembro.', unidade: 'par', alvo: 5, xp: 30, moedas: 10, premioId: null, lojas: 'TODAS', inicio: '2026-11-02T09:00:00', fim: '2026-11-07T22:00:00', status: 'RASCUNHO', produtos: ['41120'], regras: '', progressoDemo: 0 },
    ],
    competicoes: [
      { id: 'c-corrida', nome: 'Corrida de Outubro', tipo: 'VENDEDOR', formato: 'MENSAL', metrica: 'PERCENTUAL_META', unidade: 'percentual', valoresDemo: null, escopo: 'TODAS', regra: 'Maior % da própria meta do mês. Todas as lojas.', inicio: INICIO_MES, fim: FIM_MES, status: 'ATIVA', premioIds: ['p-trofeu', 'p-moedas-300'] },
      { id: 'c-sprint', nome: 'Sprint da Semana', tipo: 'VENDEDOR', formato: 'SEMANAL', metrica: null, unidade: 'vendas', valoresDemo: { ana: 21, julia: 23, maria: 18, joao: 17, carla: 12 }, escopo: 'MINHA_LOJA', regra: 'Mais vendas fechadas de segunda a sábado. Só a sua loja.', inicio: '2026-10-19T09:00:00', fim: FIM_SEMANA, status: 'ATIVA', premioIds: ['p-sprint'] },
      { id: 'c-salto', nome: 'Desafio do Salto', tipo: 'CATEGORIA', formato: 'ESPECIAL', metrica: null, unidade: 'pares', valoresDemo: { camila: 34, ana: 31, bruna: 29, maria: 27, renata: 22, patricia: 21 }, escopo: 'TODAS', regra: 'Mais pares de salto alto (acima de 5 cm) vendidos no mês.', inicio: '2026-10-10T09:00:00', fim: FIM_MES, status: 'ATIVA', premioIds: ['p-salto'] },
      { id: 'c-lojas', nome: 'Batalha das Lojas', tipo: 'LOJA', formato: 'MENSAL', metrica: null, unidade: 'pontos', valoresDemo: null, escopo: 'TODAS', regra: 'Pontuação coletiva da loja no mês. Fórmula em definição — pontos ilustrativos.', inicio: INICIO_MES, fim: FIM_MES, status: 'ATIVA', premioIds: ['p-cafe'] },
      { id: 'c-cresceu', nome: 'Quem Mais Cresceu', tipo: 'EVOLUCAO', formato: 'MENSAL', metrica: 'EVOLUCAO', unidade: 'pp', valoresDemo: null, escopo: 'TODAS', regra: 'Maior crescimento do % da meta contra o próprio histórico.', inicio: INICIO_MES, fim: FIM_MES, status: 'ATIVA', premioIds: ['p-evolucao'] },
      { id: 'c-top', nome: 'Top Seller', tipo: 'VENDEDOR', formato: 'MENSAL', metrica: 'SCORE', unidade: 'pontos', valoresDemo: null, escopo: 'TODAS', regra: 'Maior Score Geral do mês (meta, evolução, PA, ticket e consistência).', inicio: INICIO_MES, fim: FIM_MES, status: 'ATIVA', premioIds: ['p-vale'] },
      { id: 'c-black', nome: 'Aquecimento Black Friday', tipo: 'VENDEDOR', formato: 'ESPECIAL', metrica: 'PERCENTUAL_META', unidade: 'percentual', valoresDemo: null, escopo: 'TODAS', regra: 'Maior % da meta de 01/11 a 27/11.', inicio: '2026-11-01T09:00:00', fim: '2026-11-27T22:00:00', status: 'PROGRAMADA', premioIds: ['p-vale'] },
      { id: 'c-set', nome: 'Sprint de Setembro', tipo: 'VENDEDOR', formato: 'MENSAL', metrica: null, unidade: 'vendas', valoresDemo: { julia: 118, ana: 111, maria: 104 }, escopo: 'MINHA_LOJA', regra: 'Mais vendas no mês. Só a sua loja.', inicio: '2026-09-01T09:00:00', fim: '2026-09-30T22:00:00', status: 'ENCERRADA', premioIds: ['p-trofeu'] },
    ],
    campanhas: [
      {
        id: 'outubro-campeao',
        nome: 'Outubro Campeão',
        descricao: 'O programa de incentivo do mês. Cada frente tem o próprio prêmio — dá para ganhar em mais de uma.',
        objetivo: 'Acelerar a reta final do mês e premiar resultado, evolução e equipe.',
        inicio: INICIO_MES,
        fim: FIM_MES,
        status: 'ATIVA',
        lojas: 'TODAS',
        regras: 'Valem vendas finalizadas de 01/10 a 31/10. Vendedor precisa estar elegível no fim do mês.',
        frentes: [
          { id: 'top', icone: '🏆', titulo: 'Top vendedor', mecanismo: 'COMPETICAO', refId: 'c-corrida', premioId: 'p-trofeu' },
          { id: 'evolucao', icone: '🌱', titulo: 'Maior evolução', mecanismo: 'COMPETICAO', refId: 'c-cresceu', premioId: 'p-evolucao' },
          { id: 'meta', icone: '🎯', titulo: 'Meta batida', mecanismo: 'META_MES', refId: null, premioId: 'p-meta' },
          { id: 'loja', icone: '🏬', titulo: 'Loja campeã', mecanismo: 'COMPETICAO', refId: 'c-lojas', premioId: 'p-cafe' },
          { id: 'semanal', icone: '🔥', titulo: 'Desafio semanal', mecanismo: 'COMPETICAO', refId: 'c-sprint', premioId: 'p-sprint' },
        ],
        resultado: null,
        meusGanhos: null,
      },
      {
        id: 'setembro-dobro',
        nome: 'Setembro em Dobro',
        descricao: 'Campanha de setembro: meta batida e pódio valiam prêmio em dobro.',
        objetivo: 'Recuperar o ritmo pós-férias.',
        inicio: '2026-09-01T00:00:00',
        fim: '2026-09-30T23:59:00',
        status: 'ENCERRADA',
        lojas: 'TODAS',
        regras: 'Vendas finalizadas de 01/09 a 30/09.',
        frentes: [
          { id: 'top', icone: '🏆', titulo: 'Top vendedor', mecanismo: 'COMPETICAO', refId: 'c-set', premioId: 'p-trofeu' },
          { id: 'meta', icone: '🎯', titulo: 'Meta batida', mecanismo: 'META_MES', refId: null, premioId: 'p-meta' },
        ],
        resultado: [
          { frenteId: 'top', vencedor: 'Júlia Ramos', premio: 'Troféu + 300 VendaCoins', minhaPosicao: 2 },
          { frenteId: 'meta', vencedor: '9 vendedores bateram a meta', premio: '+200 XP · +80 VendaCoins', minhaPosicao: null },
        ],
        meusGanhos: { xp: 150, moedas: 40 },
      },
      {
        id: 'novembro-black',
        nome: 'Novembro Black',
        descricao: 'Preparação para a Black Friday.',
        objetivo: 'Bater 110% da meta de novembro.',
        inicio: '2026-11-01T00:00:00',
        fim: '2026-11-30T23:59:00',
        status: 'RASCUNHO',
        lojas: 'TODAS',
        regras: '',
        frentes: [
          { id: 'top', icone: '🏆', titulo: 'Top vendedor', mecanismo: 'COMPETICAO', refId: 'c-black', premioId: 'p-vale' },
          { id: 'meta', icone: '🎯', titulo: 'Meta batida', mecanismo: 'META_MES', refId: null, premioId: null },
        ],
        resultado: null,
        meusGanhos: null,
      },
    ],
    premios: [
      { id: 'p-trofeu', nome: 'Troféu Top Vendedor', tipo: 'EMPRESARIAL', xp: 0, moedas: 0, badge: null, categoria: 'EXPERIENCIA', descricao: 'Troféu entregue no café de fechamento do mês.' },
      { id: 'p-moedas-300', nome: '300 VendaCoins', tipo: 'DIGITAL', xp: 0, moedas: 300, badge: null, categoria: null, descricao: 'Crédito no ledger ao 1º lugar.' },
      { id: 'p-sprint', nome: 'Prêmio do Sprint', tipo: 'DIGITAL', xp: 100, moedas: 40, badge: null, categoria: null, descricao: 'Para o 1º lugar da semana.' },
      { id: 'p-salto', nome: 'Salto de Ouro', tipo: 'DIGITAL', xp: 0, moedas: 120, badge: 'SALTO_DE_OURO', categoria: null, descricao: 'Badge + VendaCoins para quem mais vender saltos.' },
      { id: 'p-cafe', nome: 'Café da manhã da equipe', tipo: 'EMPRESARIAL', xp: 0, moedas: 0, badge: 'DESTAQUE_DA_EQUIPE', categoria: 'EXPERIENCIA', descricao: 'Café da manhã para a loja campeã + badge.' },
      { id: 'p-evolucao', nome: 'Maior Evolução', tipo: 'DIGITAL', xp: 0, moedas: 150, badge: 'MAIOR_EVOLUCAO', categoria: null, descricao: 'Badge + 150 VendaCoins.' },
      { id: 'p-meta', nome: 'Meta do mês batida', tipo: 'DIGITAL', xp: 200, moedas: 80, badge: null, categoria: null, descricao: 'Para todos que baterem 100% da meta do mês.' },
      { id: 'p-vale', nome: 'Vale-compras R$ 300', tipo: 'EMPRESARIAL', xp: 0, moedas: 0, badge: null, categoria: 'VALE', descricao: 'Vale na própria loja. Informativo — entrega pela administração.' },
    ],
    reconhecimentos: [
      { id: 'r1', vendedorId: 'ana', motivo: 'RESULTADO', titulo: 'Atendimento que vira fidelidade', mensagem: 'Três clientes citaram seu nome na pesquisa de satisfação da semana. Obrigada, Ana!', quando: '2026-10-18T10:00:00', autor: 'Administração Sapatinho de Luxo' },
      { id: 'r2', vendedorId: 'ana', motivo: 'SUPERACAO', titulo: 'Pódio de setembro', mensagem: '2º lugar no Sprint de Setembro. Parabéns pela consistência.', quando: '2026-09-30T18:00:00', autor: 'Administração Sapatinho de Luxo' },
    ],
    feedTipos: { POSICAO: true, META: true, RECORDE: true, MISSAO: true, CONQUISTA: true, LOJA: true, COMPETICAO: true, RECONHECIMENTO: true },
    auditoria: [
      { id: 'a3', quando: '2026-10-21T17:40:00', usuario: 'admin@sapatinho', acao: 'Publicou missão', entidade: 'Missão “Scarpin da semana”', antes: 'RASCUNHO', depois: 'ATIVA', motivo: null },
      { id: 'a2', quando: '2026-10-01T08:10:00', usuario: 'admin@sapatinho', acao: 'Publicou campanha', entidade: 'Campanha “Outubro Campeão”', antes: 'PROGRAMADA', depois: 'ATIVA', motivo: null },
      { id: 'a1', quando: '2026-09-29T16:05:00', usuario: 'admin@sapatinho', acao: 'Cadastrou metas do mês', entidade: 'Metas 10/2026', antes: null, depois: '15 metas individuais', motivo: null },
    ],
    simulacao: { progresso: {}, creditos: [] },
  };
}

// ------------------------------------------------------------------ persistência

const CHAVE = 'vendedor-ia:fase1:estado';

export function carregarEstado(): EstadoDemo {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (bruto) {
      const e = JSON.parse(bruto) as EstadoDemo;
      if (e.versao === 2) return migrar(e);
    }
  } catch {
    // storage indisponível ou corrompido — volta ao estado inicial
  }
  return estadoInicial();
}

/**
 * Migrações do estado salvo no navegador durante a homologação — preservam
 * o que o Admin configurou e só retiram o que saiu do escopo.
 */
function migrar(e: EstadoDemo): EstadoDemo {
  // Out/2026: desafio direto vendedor × vendedor ("Duelo") saiu da Fase 1.
  const duelos = new Set(e.competicoes.filter((c) => (c.tipo as string) === 'DUELO').map((c) => c.id));
  if (duelos.size === 0) return e;
  return {
    ...e,
    competicoes: e.competicoes.filter((c) => !duelos.has(c.id)),
    premios: e.premios.filter((p) => p.id !== 'p-duelo'),
    campanhas: e.campanhas.map((c) => ({ ...c, frentes: c.frentes.filter((f) => !f.refId || !duelos.has(f.refId)) })),
  };
}

export function salvarEstado(e: EstadoDemo) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(e));
  } catch {
    // sem storage, a demo funciona em memória
  }
}

export function limparEstadoSalvo() {
  try {
    localStorage.removeItem(CHAVE);
  } catch {
    // idem
  }
}

/** "Agora" do mundo de demonstração — usado em auditoria e datas de criação. */
export const AGORA_DEMO = '2026-10-22T15:20:00';

let seq = 0;
export function novoId(prefixo: string): string {
  seq += 1;
  return `${prefixo}-${Date.now().toString(36)}-${seq}`;
}
