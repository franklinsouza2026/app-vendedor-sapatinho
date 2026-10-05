/**
 * Contrato de dados da Fase 1 — Performance & Game.
 *
 * É o formato que as telas consomem. Em produção vem INTEIRO do servidor
 * (GET /app/painel — src/fase1/painel/painel.service.ts); nos testes de
 * interface, de `demo/cenarios.ts`. As telas NÃO conhecem a origem.
 *
 * Valores DERIVADOS (percentual, falta, vendas estimadas, pares, ritmo,
 * distância no ranking) não ficam aqui: são calculados em `estimativas.ts`,
 * para que o texto nunca contradiga o dado.
 */

export type Metrica = 'SCORE' | 'VENDAS' | 'PERCENTUAL_META' | 'EVOLUCAO' | 'PA' | 'TICKET' | 'CONSISTENCIA';

export interface Pessoa {
  id: string;
  nome: string;
  lojaId: string;
}

export interface Loja {
  id: string;
  nome: string;
}

/** Realizado de um período. `ticketMedio`/`pa` são null quando não há venda suficiente para calculá-los. */
export interface Realizado {
  faturamento: number;
  vendas: number;
  /** Peças válidas (D12: base do PA). */
  pecas: number;
  /** Pares físicos de calçado (indicador "Pares vendidos"; não é a base do PA). */
  pares: number;
  ticketMedio: number | null;
  /** D12 — PA = Peças por Atendimento (peças ÷ atendimentos). */
  pa: number | null;
}

export interface PeriodoMeta {
  meta: number | null;
  realizado: Realizado;
}

export interface PeriodoMes extends PeriodoMeta {
  /** Dias de trabalho restantes DEPOIS de hoje. null = escala não cadastrada. */
  diasTrabalhoRestantes: number | null;
  diasTrabalhados: number;
}

/**
 * Linha de ranking como o SERVIDOR entrega (D9): posição já com desempate
 * (faturamento → acessos no mês → ticket → empate). Privacidade: `valor` de
 * métrica financeira de colega vem null; `distanciaAcima` só na própria linha.
 */
export interface LinhaRankingBruta {
  pessoaId: string;
  valor: number | null;
  /** Posição calculada no servidor (empate = mesma posição). Ausente só em dado legado de demonstração. */
  posicao?: number;
  /** Posição no período comparável anterior — para mostrar ↑↓. null = não estava no ranking. */
  posicaoAnterior: number | null;
  /** Só na linha de quem está vendo: quanto falta para a linha imediatamente acima. */
  distanciaAcima?: number | null;
  empatado?: boolean;
}

export interface LinhaRankingLoja {
  lojaId: string;
  pontos: number;
  posicao?: number;
  posicaoAnterior: number | null;
  distanciaAcima?: number | null;
}

export type TipoMissao = 'DIARIA' | 'SEMANAL' | 'CATEGORIA' | 'PERFORMANCE' | 'CONSISTENCIA' | 'PRODUTO_SEMANA' | 'PONTA_ESTOQUE';

export interface Recompensa {
  xp: number;
  moedas: number;
}

export interface Missao {
  id: string;
  tipo: TipoMissao;
  titulo: string;
  descricao: string;
  unidade: 'venda' | 'par' | 'dia' | 'reais';
  progresso: number;
  alvo: number;
  recompensa: Recompensa;
  terminaEm: string;
  /** Produtos elegíveis (Produto da Semana / ponta de estoque). */
  produtos?: { referencia: string; nome: string; foto?: string }[];
  concluidaEm?: string;
  /** Prêmio empresarial/digital extra, além de XP e VendaCoins. */
  premio?: string;
  /** Regra de contagem — o que vale para o progresso. */
  regra?: string;
}

/**
 * Desafio direto vendedor × vendedor ("Duelo") foi RETIRADO da Fase 1 na
 * homologação (out/2026): não há jornada definida de desafiar, aceitar,
 * recusar, regra e conclusão. Competições continuam sendo criadas pelo Admin.
 */
export type TipoCompeticao = 'VENDEDOR' | 'LOJA' | 'EVOLUCAO' | 'CATEGORIA';

export interface Competicao {
  id: string;
  nome: string;
  tipo: TipoCompeticao;
  formato: 'MENSAL' | 'SEMANAL' | 'ESPECIAL';
  regra: string;
  /** Unidade do valor dos participantes. Nunca R$ de colegas (mesma regra de privacidade do ranking atual). */
  unidade: 'vendas' | 'pares' | 'pontos' | 'percentual' | 'pp';
  iniciaEm: string;
  terminaEm: string;
  status: 'ATIVA' | 'PROXIMA' | 'ENCERRADA';
  premio: string;
  /** Participantes já ordenados (pessoas ou lojas, conforme `tipo`). `valor` null = valor financeiro de colega (privacidade). */
  participantes: { id: string; nome: string; valor: number | null; posicao?: number }[];
  /** id do participante que representa o vendedor (ele mesmo ou a loja dele). */
  meuId: string;
}

export interface Campanha {
  id: string;
  nome: string;
  descricao: string;
  iniciaEm: string;
  terminaEm: string;
  status: 'ATIVA' | 'ENCERRADA';
  regras: string;
  frentes: { id: string; icone: string; titulo: string; descricao: string; premio: string; situacao: string; competicaoId?: string }[];
  /** Só em campanha encerrada. */
  resultado?: { titulo: string; vencedor: string; premio: string; minhaPosicao: number | null }[];
  meusGanhos?: { xp: number; moedas: number } | null;
}

export interface EventoXp {
  id: string;
  quando: string;
  origem: string;
  xp: number;
}

export interface EventoMoedas {
  id: string;
  quando: string;
  origem: string;
  valor: number;
}

export interface Conquista {
  codigo: string;
  titulo: string;
  descricao: string;
  icone: string;
  /** CATALOGO = já existe em `badges.service.ts`; PROPOSTA = sugerida pela Fase 1, ainda sem regra no backend. */
  origem: 'CATALOGO' | 'PROPOSTA';
  conquistadaEm: string | null;
  /** Quanto falta, em texto curto já no idioma da tela ("faltam R$ 120 no dia"). */
  falta?: string;
  progresso?: number; // 0..100
}

export type TipoRecorde = 'MELHOR_DIA' | 'MELHOR_MES' | 'MAIOR_TICKET' | 'MELHOR_PA' | 'MAIOR_SEQUENCIA' | 'MELHOR_POSICAO' | 'MAIOR_PERCENTUAL';

export interface Recorde {
  tipo: TipoRecorde;
  titulo: string;
  unidade: 'reais' | 'pa' | 'dias' | 'posicao' | 'percentual';
  valor: number;
  quando: string;
  /** Valor atual em disputa (mês corrente, dia corrente...). null = não se aplica agora. */
  atual: number | null;
}

export type TipoFeed = 'POSICAO' | 'META' | 'RECORDE' | 'MISSAO' | 'CONQUISTA' | 'LOJA' | 'COMPETICAO' | 'RECONHECIMENTO';

export interface EventoFeed {
  id: string;
  tipo: TipoFeed;
  quando: string;
  icone: string;
  texto: string;
  /** Destaca quando o evento é sobre o próprio vendedor ou a loja dele. */
  meu?: boolean;
}

export interface Reconhecimento {
  id: string;
  quando: string;
  autor: string;
  motivo: string;
  titulo: string;
  mensagem: string;
}

export interface MesHistorico {
  mes: string; // '2026-05'
  faturamento: number;
  meta: number;
  ticketMedio: number;
  pa: number;
  vendas: number;
}

export type TipoCelebracao = 'META_DIA' | 'PRIMEIRO_LUGAR' | 'RECORDE' | 'NIVEL' | 'MOEDAS' | 'MISSAO' | 'BADGE';

export interface Celebracao {
  id: string;
  tipo: TipoCelebracao;
  titulo: string;
  detalhe: string;
  recompensa?: Recompensa;
}

/**
 * Candidato a "Próximo Alvo" — DERIVADO dos dados (ver `alvos.ts`), nunca
 * escrito à mão no mock. `esforcoVendas` é a estimativa em vendas; null quando
 * não converte (ex.: XP).
 */
export interface Alvo {
  id: string;
  tipo: 'META_DIA' | 'META_MES' | 'RANKING' | 'MISSAO' | 'NIVEL' | 'DESAFIO' | 'RECORDE';
  icone: string;
  falta: string;
  objetivo: string;
  esforcoVendas: number | null;
  rota: string;
}

export interface StatusDados {
  /** Hora do último sync do ERP. null = nunca sincronizou hoje. */
  sincronizadoEm: string | null;
  desatualizado: boolean;
  rankingDisponivel: boolean;
  diaDeFolga: boolean;
  lojaFechada: boolean;
  offline: boolean;
}

export interface Fase1Dados {
  /** Instante de referência do servidor (fixo nos cenários de teste). */
  agora: string;
  vendedor: Pessoa & { primeiroNome: string; empresa: string; admitidoEm: string; novo: boolean };
  lojas: Loja[];
  pessoas: Pessoa[];
  status: StatusDados;
  hoje: PeriodoMeta;
  mes: PeriodoMes;
  /** Ticket/PA que alimentam as estimativas. Ver `referenciaEstimativa` em estimativas.ts. */
  referencia: { ticketMedio: number | null; pa: number | null; origem: 'MES' | 'LOJA' | null };
  rankings: {
    loja: Record<Metrica, LinhaRankingBruta[]>;
    geral: Record<Metrica, LinhaRankingBruta[]>;
    lojas: LinhaRankingLoja[];
    /** Fórmula do Loja × Loja definida pelo Admin; null = disputa entre lojas desligada. */
    lojasFormula?: 'PCT_META_COLETIVA' | 'MEDIA_SCORE' | 'EVOLUCAO_COLETIVA' | null;
    /** Médias calculadas no servidor (null = grupo pequeno demais para mostrar sem expor colegas). */
    medias?: { loja: Record<Metrica, number | null>; geral: Record<Metrica, number | null> };
  };
  xp: { total: number; historico: EventoXp[] };
  /** Nível calculado no SERVIDOR (fonte única da curva de níveis). */
  nivel: NivelDados;
  moedas: { saldo: number; historico: EventoMoedas[] };
  sequencia: { atual: number; maior: number; criterio: string };
  missoes: Missao[];
  competicoes: Competicao[];
  /** Ativas primeiro, depois encerradas (histórico). */
  campanhas: Campanha[];
  /** Cenário que destaca a campanha na Home. */
  campanhaEmDestaque: boolean;
  conquistas: Conquista[];
  recordes: Recorde[];
  feed: EventoFeed[];
  reconhecimentos: Reconhecimento[];
  historico: MesHistorico[];
  /** Valores do mês do período comparável (mês anterior até o mesmo dia) — para tendências. */
  comparavel: Realizado & { percentualMeta: number };
  celebracoes: Celebracao[];
  /** Indicadores que o Admin liberou para o vendedor (confiáveis e ativos). */
  indicadores: Record<IndicadorVendedor, boolean>;
  /** Métricas de ranking ativas e visíveis, e a métrica da "corrida" na Home. */
  metricasRanking: Metrica[];
  metricaCorrida: Metrica;
  elegibilidade: { elegivel: boolean; motivo: string | null };
}

export interface NivelDados {
  nivel: number;
  nome: string;
  xpInicioNivel: number;
  proximo: { nivel: number; nome: string; xpMinimo: number } | null;
  faltaXp: number | null;
  progresso: number;
  niveis: { nivel: number; nome: string; xpMinimo: number }[];
}

export type IndicadorVendedor = 'VENDAS' | 'QTD_VENDAS' | 'PARES' | 'TICKET' | 'PA' | 'PERCENTUAL_META' | 'SCORE' | 'EVOLUCAO' | 'CONSISTENCIA' | 'CONVERSAO';
