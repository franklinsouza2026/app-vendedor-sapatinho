// Knowledge Router (Etapa 2C.4) — decide se ESTE turno pede conhecimento.
//
// Até aqui o sistema aprendeu a GUARDAR conhecimento. Este arquivo existe para
// ensiná-lo a **não usar conhecimento só porque ele existe**.
//
// A pergunta que o Router responde é uma só: *dado o momento e a intenção já
// compreendidos, existe um domínio de conhecimento claramente pertinente?*
// Resposta: um pedido estruturado, ou `NO_KNOWLEDGE`.
//
// **`NO_KNOWLEDGE` É SUCESSO.** Não é erro, não é fallback ruim, não é coisa a
// evitar. Na maior parte das conversas é a resposta certa.
//
// O QUE ELE NÃO FAZ: não responde ao vendedor, não escreve conselho, não gera
// texto, não escolhe tom, não diagnostica, não lê KPI, não lê check-in, não lê
// memória nem conversa, não toca o banco e não chama LLM nenhum. Ele também
// **não escolhe o card** — isso é do Retriever (2C.2).
//
// VIÉS DELIBERADO: falso positivo é mais grave que falso negativo. É melhor
// deixar de trazer uma ideia útil uma vez do que empurrar conselho para quem
// queria ser ouvido.
import { EstadoComportamental, Intencao } from '../pertinencia/tipos';

/** O que o turno já sabe quando o Router é chamado. Nada além disto. */
export interface SinalDoTurno {
  /** Momento comportamental já decidido pelo motor de pertinência (2B.1). */
  estado: EstadoComportamental;
  /** Intenção já classificada (2B.1) — enum fechado, nunca texto livre do LLM. */
  intencao: Intencao;
  /** As palavras da própria pessoa. Nunca KPI, humor bruto ou memória. */
  mensagem: string;
}

/**
 * Necessidades reconhecidas dentro do piloto de Hábitos.
 *
 * NÃO é o card: é a forma da necessidade. Quem escolhe o card é o Retriever,
 * pelas regras de elegibilidade, escopo e precedência da 2C.2.
 */
export const TOPICOS = ['START_SMALL', 'ENVIRONMENT', 'TRIGGER', 'CONSISTENCY', 'RESUME', 'MULTIPLE_CHANGES'] as const;
export type TopicoConhecimento = (typeof TOPICOS)[number];

export const MOTIVOS_ROTA = ['EXPLICIT_KNOWLEDGE_REQUEST', 'DEVELOPMENT_INTENT', 'STRUGGLE_REPORTED'] as const;
export type MotivoRota = (typeof MOTIVOS_ROTA)[number];

export const MOTIVOS_SILENCIO = [
  /** "não quero dica agora" — absoluto naquele turno. */
  'REFUSAL',
  /** "só queria conversar", "não quero conselho". */
  'PERSON_WANTS_LISTENING',
  /** A pessoa vem antes: acolher primeiro, sempre. */
  'WELCOMING_FIRST',
  /** Vitória não vira aula. */
  'CELEBRATION_ONLY',
  /** Saúde, sono, sofrimento clínico — não é biblioteca de hábitos. */
  'OUT_OF_SCOPE_HEALTH',
  /** Pergunta de diagnóstico. O Router não diagnostica. */
  'DIAGNOSIS_REQUEST',
  /** Existe assunto, mas não há conhecimento governado para ele. */
  'DOMAIN_NOT_GOVERNED',
  /** É contexto comercial, não biblioteca. */
  'NO_RELEVANT_DOMAIN',
  /** Há tema, mas nem pedido nem dificuldade relatada — ninguém pediu nada. */
  'INSUFFICIENT_SIGNAL',
] as const;
export type MotivoSilencio = (typeof MOTIVOS_SILENCIO)[number];

/** Código da Escola do piloto — a única com conhecimento governado hoje. */
export const ESCOLA_HABITOS = 'organizacao';

export type RotaDeConhecimento =
  | { tipo: 'KNOWLEDGE_REQUEST'; escola: string; topico: TopicoConhecimento; motivo: MotivoRota }
  | { tipo: 'NO_KNOWLEDGE'; motivo: MotivoSilencio };

const silencio = (motivo: MotivoSilencio): RotaDeConhecimento => ({ tipo: 'NO_KNOWLEDGE', motivo });

// ---------------------------------------------------------------------------
// Barreiras — avaliadas ANTES de qualquer detecção de tema, e nessa ordem.
// ---------------------------------------------------------------------------

/**
 * Recusa explícita. Primeira de todas, e absoluta.
 *
 * Quem disse "não quero" não pode receber outro card no lugar — isso é a
 * cobrança disfarçada que a 2B.3 já tinha fechado do lado das intervenções.
 */
const RECUSA = [
  /\bn[ãa]o\s+quero\s+(dica|conselho|sugest[ãa]o|ajuda)\b/i,
  /\bn[ãa]o\s+(quero|preciso)\s+(fazer\s+)?(isso|nada\s+disso)\b/i,
  /\b(deixa\s+pra\s+l[áa]|esquece\s+isso|agora\s+n[ãa]o\s+quero)\b/i,
];

/** Pedido explícito de escuta — a pessoa já disse o que quer, e não é conselho. */
const QUER_ESCUTA = [
  /\bs[óo]\s+(queria|quero|precisava|preciso)\s+(falar|conversar|desabafar)\b/i,
  /\bqueria\s+(s[óo]\s+)?(falar|conversar|desabafar)\b/i,
];

/**
 * Saúde e sofrimento clínico. Vem ANTES da detecção de tema de propósito:
 * "não durmo e por isso não mantenho rotina" fala de rotina, e mesmo assim o
 * assunto é sono. Transformar isso num card de hábito seria responder a coisa
 * errada com confiança.
 */
const SAUDE = [
  /\bn[ãa]o\s+(consigo|estou\s+conseguindo)\s+dormir\b/i,
  /\b(ins[ôo]nia|dor\s+cr[ôo]nica|rem[ée]dio|medica[çc][ãa]o|tratamento|terapia|psic[óo]log|psiquiatr|m[ée]dic)/i,
  /\b(depress[ãa]o|ansiedade|burnout|s[íi]ndrome\s+do\s+p[âa]nico)\b/i,
];

/** Pergunta de diagnóstico. O Conselheiro não é terapeuta, e o Router não infere. */
const DIAGNOSTICO = [
  /\bser[áa]\s+que\s+(eu\s+)?tenho\b/i,
  /\b(tdah|d[ée]ficit\s+de\s+aten[çc][ãa]o|transtorno|bipolar|autis)/i,
  /\b(eu\s+)?tenho\s+algum\s+(problema|transtorno|dist[úu]rbio)\b/i,
];

/**
 * Assuntos reais que **ainda não têm biblioteca governada**.
 *
 * Silenciar aqui é o ponto: o produto tem seis cards de Hábitos e mais nada.
 * Rotear vendas para "organização" porque é o que existe seria exatamente o
 * erro que esta fatia previne. E o Treinador saber responder objeção não
 * autoriza o Conselheiro a atravessar subsistema.
 */
const DOMINIO_SEM_BIBLIOTECA = [
  /\b(objec[çc][ãa]o|est[áa]\s+caro|t[áa]\s+caro|desconto|fechar\s+a\s+venda|abordagem\s+do\s+cliente)\b/i,
  /\b(f[íi]sica\s+qu[âa]ntica|qu[âa]ntic|manifesta[çc][ãa]o|lei\s+da\s+atra[çc][ãa]o|vibra[çc][ãa]o|energia\s+do\s+universo)\b/i,
  /\b(espiritualidade|espiritual|f[ée]|ora[çc][ãa]o|medita[çc][ãa]o\s+guiada|prop[óo]sito\s+de\s+vida)\b/i,
  /\b(investi(r|mento)|divida|d[íi]vida|or[çc]amento\s+pessoal|juros|financ)/i,
  /\b(liderar|lideran[çc]a|minha\s+equipe|dar\s+feedback|gerir\s+pessoas)\b/i,
];

// ---------------------------------------------------------------------------
// Sinais de que conhecimento seria útil.
// ---------------------------------------------------------------------------

/** Pedido explícito de orientação. */
const PEDIDO_DE_AJUDA = [
  /\b(como\s+(eu\s+)?(fa[çc]o|consigo|posso|fa[çc]a)|o\s+que\s+(eu\s+)?fa[çc]o)\b/i,
  /\b(me\s+d[áa]|tem|alguma|uma)\s+(dica|sugest[ãa]o|ideia)\b/i,
  /\bme\s+ajuda\s+a\b/i,
  /\bpor\s+onde\s+(eu\s+)?come[çc]o\b/i,
];

/**
 * DIFICULDADE RELATADA — o sinal que separa um problema de um plano.
 *
 * Esta distinção é a mais importante do arquivo. "Começo e largo depois de três
 * dias" relata um problema que se repete: conhecimento pode ajudar. "Segunda eu
 * vou acordar 5h, correr e estudar" é uma declaração de intenção — ninguém
 * pediu nada, e responder com técnica é palestra não solicitada.
 */
const DIFICULDADE = [
  /\b(come[çc]o|comecei|inicio|iniciei)\b.*\b(largo|larguei|paro|parei|desisto|desisti|abandono|abandonei)\b/i,
  /\bn[ãa]o\s+(consigo|estou\s+conseguindo)\s+(manter|seguir|continuar|sustentar)\b/i,
  /\b(esque[çc]o|esqueci|esquecer|acabo\s+esquecendo|n[ãa]o\s+lembro)\b/i,
  /\bacabo\s+(fazendo|pegando|indo)\b/i,
  /\b(me\s+distrai|acabo\s+me\s+distraindo)\b/i,
  /\b(n[ãa]o\s+[ée]\s+sempre|n[ãa]o\s+consigo\s+ser\s+constante|fica\s+irregular)\b/i,
  /\b(estraguei|perdi\s+tudo|j[áa]\s+era|acabei\s+com)\b/i,
  /\bmas\s+(n[ãa]o|acabo|esque[çc]o|paro|largo)\b/i,
  /\bdepois\s+(de\s+\w+\s+dias?\s+)?(eu\s+)?(largo|paro|desisto)\b/i,
];

/**
 * Tópicos, na ordem em que são testados.
 *
 * Ordem importa: "esqueço" (TRIGGER) é mais específico que "começo e largo"
 * (START_SMALL), e "estraguei tudo" (RESUME) é mais específico que
 * irregularidade genérica.
 */
const POR_TOPICO: { topico: TopicoConhecimento; padroes: RegExp[] }[] = [
  {
    // Interrompeu e trata como fracasso.
    topico: 'RESUME',
    padroes: [/\b(estraguei|j[áa]\s+era|perdi\s+tudo|quebrei\s+a\s+sequ[êe]ncia|falhei\s+ontem)\b/i, /\bontem\s+(eu\s+)?n[ãa]o\s+fiz\b/i],
  },
  {
    // Quer fazer, esquece.
    topico: 'TRIGGER',
    padroes: [
      // Inclui o INFINITIVO: "como faço pra não esquecer" é a forma mais
      // natural de pedir ajuda com isso, e sem ele o pedido mais explícito
      // que existe caía em silêncio.
      /\b(esque[çc]o|esqueci|esquecer|acabo\s+esquecendo|n[ãa]o\s+lembro|lembrar)\b/i,
      /\bo\s+dia\s+passa\s+e\s+(eu\s+)?n[ãa]o\b/i,
    ],
  },
  {
    // O contexto atrapalha.
    topico: 'ENVIRONMENT',
    padroes: [
      /\bacabo\s+(pegando|fazendo|indo)\b.*\b(celular|outra\s+coisa|televis|tv|sof[áa])/i,
      // Distração é o miolo do card de ambiente, e "acabo me distraindo" é
      // como a pessoa realmente escreve — sem isto, o cenário mais óbvio do
      // tópico caía em silêncio.
      /\b(me\s+distrai|acabo\s+me\s+distraindo|fico\s+no\s+celular|vou\s+pro\s+celular)\b/i,
      /\b(chego\s+em\s+casa|quando\s+chego)\b.*\b(acabo|fa[çc]o\s+outra)/i,
      /\b(t[áa]|est[áa])\s+(longe|guardado|dif[íi]cil\s+de\s+pegar)\b/i,
    ],
  },
  {
    // Faz muito de uma vez, depois some.
    topico: 'CONSISTENCY',
    padroes: [
      /\b(duas?|tr[êe]s|quatro|v[áa]rias)\s+horas?\b.*\b(depois|da[íi])\b.*\b(semana|dias?)\s+sem\b/i,
      /\bquando\s+(eu\s+)?(fa[çc]o|estudo|treino)\b.*\b(bastante|muito)\b/i,
      /\b(n[ãa]o\s+[ée]\s+sempre|fica\s+irregular|n[ãa]o\s+consigo\s+ser\s+constante)\b/i,
    ],
  },
  {
    // Várias frentes ao mesmo tempo.
    topico: 'MULTIPLE_CHANGES',
    padroes: [/\b(segunda|amanh[ãa]|dia\s+1|ano\s+novo)\b.*\b(vou|come[çc]o)\b.*,.*\be\b/i, /\b(tudo\s+de\s+uma\s+vez|v[áa]rias\s+coisas\s+ao\s+mesmo\s+tempo)\b/i],
  },
  {
    // Começa e abandona — a queixa mais comum de todas.
    topico: 'START_SMALL',
    padroes: [
      /\b(come[çc]o|comecei)\b.*\b(largo|larguei|paro|parei|desisto|desisti|abandono|abandonei)\b/i,
      /\bdepois\s+de\s+\w+\s+dias?\b.*\b(largo|paro|desisto)\b/i,
      /\bn[ãa]o\s+(consigo|estou\s+conseguindo)\s+(manter|sustentar)\b/i,
    ],
  },
];

const casa = (padroes: RegExp[], texto: string) => padroes.some((re) => re.test(texto));

function detectarTopico(mensagem: string): TopicoConhecimento | null {
  for (const { topico, padroes } of POR_TOPICO) if (casa(padroes, mensagem)) return topico;
  return null;
}

/**
 * Decide a rota. **Função pura**: sem banco, sem IA, sem relógio, sem rede.
 *
 * A ordem das barreiras é a regra de produto, não detalhe de implementação:
 * recusa e pedido de escuta vêm antes de tudo, o acolhimento vem antes do
 * tema, e a fronteira de saúde vem antes da detecção de hábito — porque uma
 * mensagem sobre insônia menciona rotina e não é sobre rotina.
 */
export function rotearConhecimento(sinal: SinalDoTurno): RotaDeConhecimento {
  const { mensagem, estado, intencao } = sinal;

  // 1. Dizer o que QUER é mais específico que dizer o que não quer: numa frase
  //    como "não quero conselho, só precisava falar", o pedido de escuta é a
  //    informação verdadeira. As duas levam a silêncio; muda só o motivo, e
  //    motivo registrado errado é diagnóstico errado depois.
  if (casa(QUER_ESCUTA, mensagem)) return silencio('PERSON_WANTS_LISTENING');

  // 2. Recusa. Nada substitui isso, e não se procura outro card "que talvez
  //    sirva" — é a cobrança disfarçada que a 2B.3 já tinha fechado.
  if (casa(RECUSA, mensagem)) return silencio('REFUSAL');

  // 3. Fronteiras clínicas, antes de qualquer tema.
  if (casa(DIAGNOSTICO, mensagem)) return silencio('DIAGNOSIS_REQUEST');
  if (casa(SAUDE, mensagem)) return silencio('OUT_OF_SCOPE_HEALTH');

  // 4. A pessoa vem antes (Constituição): acolher não convive com técnica.
  if (estado === 'ACOLHER') return silencio('WELCOMING_FIRST');

  // 5. Vitória não vira aula.
  if (estado === 'CELEBRAR' || intencao === 'CELEBRACAO') return silencio('CELEBRATION_ONLY');

  // 6. Pergunta pelos próprios números é contexto comercial, não biblioteca.
  if (intencao === 'DUVIDA_COMERCIAL') return silencio('NO_RELEVANT_DOMAIN');

  // 7. Assunto real, biblioteca inexistente. Hoje só Hábitos é governado —
  //    rotear vendas para "organização" porque é o que existe seria o erro
  //    exato que esta fatia previne.
  if (casa(DOMINIO_SEM_BIBLIOTECA, mensagem)) return silencio('DOMAIN_NOT_GOVERNED');

  const topico = detectarTopico(mensagem);
  if (!topico) return silencio('INSUFFICIENT_SIGNAL');

  // 8. Existe tema — mas ter tema não é ter pedido. Sem dificuldade relatada e
  //    sem pedido de ajuda, ninguém pediu nada: uma declaração de planos não
  //    autoriza técnica.
  const pediuAjuda = casa(PEDIDO_DE_AJUDA, mensagem);
  const relatouDificuldade = casa(DIFICULDADE, mensagem);
  if (!pediuAjuda && !relatouDificuldade && intencao !== 'DESENVOLVIMENTO') return silencio('INSUFFICIENT_SIGNAL');

  const motivo: MotivoRota = pediuAjuda ? 'EXPLICIT_KNOWLEDGE_REQUEST' : relatouDificuldade ? 'STRUGGLE_REPORTED' : 'DEVELOPMENT_INTENT';
  return { tipo: 'KNOWLEDGE_REQUEST', escola: ESCOLA_HABITOS, topico, motivo };
}

/**
 * Tradução tópico → tags de busca.
 *
 * Fica aqui, e não dentro do Retriever, porque é vocabulário de NECESSIDADE:
 * o Retriever continua genérico (filtra por tag), e o Router continua
 * semântico (fala de necessidade). Nenhum dos dois conhece o id de um card.
 */
export const TAGS_POR_TOPICO: Record<TopicoConhecimento, string[]> = {
  START_SMALL: ['comeco'],
  ENVIRONMENT: ['ambiente'],
  TRIGGER: ['gatilho'],
  CONSISTENCY: ['consistencia'],
  RESUME: ['retomada'],
  MULTIPLE_CHANGES: ['prioridade'],
};
