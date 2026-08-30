// Catálogo inicial de cenários (seção "CENÁRIOS DE SIMULAÇÃO" da Fatia 6).
// Conteúdo demonstrativo de varejo genérico — não há material oficial da
// empresa sobre roteiro de cliente simulado (o Playbook real, os "13
// Mandamentos SDL", já está todo referenciado via playbookCategorias, que
// resolve pro conteúdo OFICIAL de verdade em tempo de execução).
import { CategoriaPlaybook, DificuldadeSimulacao, Prisma } from '@prisma/client';
import { prisma } from '../db';
import { PersonaSimulacao } from './context.types';
import { CriterioAvaliacao } from './rubrica';

interface PersonaBase {
  profile: string;
  initialNeed: string;
  behavior: string;
  objectionsPool: string[]; // ordem crescente de dificuldade — EASY usa só a 1ª, HARD usa todas
  hiddenNeeds: string[];
  successCondition: string;
}

// Dificuldade controla QUANTAS objeções aparecem e o tom do comportamento —
// nunca usada pra humilhar o vendedor (seção "DIFICULDADE" da Fatia 6),
// só pra variar o quanto de sondagem/argumentação é exigido.
function gerarPersonasPorDificuldade(base: PersonaBase): Record<DificuldadeSimulacao, PersonaSimulacao> {
  return {
    EASY: {
      profile: base.profile,
      initialNeed: base.initialNeed,
      hiddenNeeds: base.hiddenNeeds,
      objections: base.objectionsPool.slice(0, 1),
      behavior: `${base.behavior} Você é receptiva e coopera com facilidade.`,
      successCondition: base.successCondition,
    },
    MEDIUM: {
      profile: base.profile,
      initialNeed: base.initialNeed,
      hiddenNeeds: base.hiddenNeeds,
      objections: base.objectionsPool.slice(0, 2),
      behavior: `${base.behavior} Você tem algumas dúvidas, mas está aberta a ser convencida.`,
      successCondition: base.successCondition,
    },
    HARD: {
      profile: base.profile,
      initialNeed: base.initialNeed,
      hiddenNeeds: base.hiddenNeeds,
      objections: base.objectionsPool,
      behavior: `${base.behavior} Você é mais resistente e cética — só muda de ideia com uma sondagem e argumentação genuinamente boas.`,
      successCondition: base.successCondition,
    },
  };
}

interface CenarioSeed {
  code: string;
  title: string;
  description: string;
  category: string;
  objective: string;
  playbookCategorias: CategoriaPlaybook[];
  criteriosAvaliacao: CriterioAvaliacao[];
  persona: PersonaBase;
}

const CENARIOS: CenarioSeed[] = [
  {
    code: 'ABORDAGEM_CLIENTE_FRIO',
    title: 'Cliente reservada',
    description: 'Uma cliente entra na loja sem demonstrar entusiasmo. O desafio é criar conexão logo na abertura.',
    category: 'ABORDAGEM',
    objective: 'Quebrar o gelo e criar conexão inicial com uma cliente reservada, sem parecer invasivo.',
    playbookCategorias: ['ABORDAGEM'],
    criteriosAvaliacao: ['ABORDAGEM', 'ESCUTA', 'CLAREZA'],
    persona: {
      profile: 'Cliente adulta, reservada, que não gosta de vendedores insistentes.',
      initialNeed: 'Oi... só vou dar uma olhada por aqui, obrigada.',
      behavior: 'Responde com frases curtas até sentir que o vendedor está genuinamente interessado em ajudar, não só em vender.',
      objectionsPool: ['Não precisa me acompanhar, eu chamo se precisar.', 'Já vim aqui outras vezes e não gostei muito do atendimento.'],
      hiddenNeeds: ['Está procurando um presente de aniversário e não sabe bem o que escolher.'],
      successCondition: 'O vendedor conquista a abertura da cliente sem pressioná-la, e ela aceita ser ajudada.',
    },
  },
  {
    code: 'CLIENTE_APRESSADO',
    title: 'Cliente com pressa',
    description: 'Cliente com pouco tempo disponível, precisa de um atendimento objetivo e rápido.',
    category: 'ABORDAGEM',
    objective: 'Atender bem mesmo com pouco tempo disponível, sem pular etapas importantes.',
    playbookCategorias: ['ABORDAGEM', 'SONDAGEM'],
    criteriosAvaliacao: ['ABORDAGEM', 'SONDAGEM', 'CLAREZA'],
    persona: {
      profile: 'Cliente numa pausa curta do trabalho, olhando o relógio.',
      initialNeed: 'Oi, eu tenho uns 10 minutos só. Preciso de um sapato social preto, número 38.',
      behavior: 'Fica impaciente com perguntas que pareçam desnecessárias, mas responde bem a perguntas diretas e úteis.',
      objectionsPool: ['Não tenho tempo pra experimentar muitas opções.', 'Se não for rápido, vou ter que voltar outro dia.'],
      hiddenNeeds: ['Precisa do sapato pra uma reunião importante amanhã e está ansiosa com isso.'],
      successCondition: 'O vendedor resolve a necessidade dela dentro do tempo que ela tem, sem fazê-la sentir que perdeu tempo.',
    },
  },
  {
    code: 'CLIENTE_SO_OLHANDO',
    title: 'Cliente "só olhando"',
    description: 'Cliente que entra na loja e imediatamente diz que só está olhando.',
    category: 'ABORDAGEM',
    objective: 'Engajar uma cliente que inicialmente diz só estar olhando, sem forçar a venda.',
    playbookCategorias: ['ABORDAGEM'],
    criteriosAvaliacao: ['ABORDAGEM', 'ESCUTA'],
    persona: {
      profile: 'Cliente navegando sem destino claro, testando se vale a pena ficar na loja.',
      initialNeed: 'Só estou dando uma olhadinha, pode deixar.',
      behavior: 'Vai relaxando conforme o vendedor demonstra que não vai pressioná-la a comprar algo.',
      objectionsPool: ['Não sei se hoje é um bom dia pra comprar.', 'Prefiro olhar sozinha por enquanto.'],
      hiddenNeeds: ['Está pesquisando modelos pra decidir com calma e comprar depois.'],
      successCondition: 'O vendedor deixa a porta aberta pra ajudar sem pressionar, e a cliente aceita ver algumas opções.',
    },
  },
  {
    code: 'CLIENTE_PRECO',
    title: 'Objeção de preço',
    description: 'Cliente interessada no produto, mas acha o preço alto.',
    category: 'OBJECAO',
    objective: 'Trabalhar a objeção de preço sem depreciar o produto nem inventar desconto.',
    playbookCategorias: ['OBJECOES', 'DEMONSTRACAO'],
    criteriosAvaliacao: ['TRATAMENTO_DE_OBJECOES', 'ARGUMENTACAO', 'USO_DO_PLAYBOOK'],
    persona: {
      profile: 'Cliente que gostou do produto mas está com o orçamento apertado.',
      initialNeed: 'Gostei muito desse aqui, mas achei o preço salgado.',
      behavior: 'Reage bem quando o vendedor demonstra valor real do produto, sem simplesmente insistir no preço.',
      objectionsPool: ['Está caro pra mim agora.', 'Vi um parecido mais barato em outro lugar.', 'Será que não dá pra fazer um precinho melhor?'],
      hiddenNeeds: ['Na verdade tem condições de pagar, só quer se sentir segura de que vale o investimento.'],
      successCondition: 'O vendedor demonstra valor sem inventar desconto/condição não autorizada, e a cliente reconsidera.',
    },
  },
  {
    code: 'CLIENTE_INDECISO',
    title: 'Cliente indeciso',
    description: 'Cliente gosta de vários produtos e não consegue decidir.',
    category: 'FECHAMENTO',
    objective: 'Ajudar uma cliente indecisa a decidir com confiança, sem empurrar a escolha.',
    playbookCategorias: ['FECHAMENTO', 'DEMONSTRACAO'],
    criteriosAvaliacao: ['SONDAGEM', 'ARGUMENTACAO', 'FECHAMENTO'],
    persona: {
      profile: 'Cliente que gosta de várias opções e tem dificuldade de decidir sozinha.',
      initialNeed: 'Gostei de uns três modelos diferentes, não sei qual escolher.',
      behavior: 'Fica mais confiante quando o vendedor ajuda a comparar com base no que ela realmente precisa, não só opinião pessoal.',
      objectionsPool: ['Ainda não tenho certeza qual dos três é o melhor.', 'Acho que vou pensar mais um pouco antes de decidir.'],
      hiddenNeeds: ['Vai usar o produto numa ocasião específica que ainda não mencionou.'],
      successCondition: 'O vendedor sonda o uso real e ajuda a cliente a fechar com confiança em uma opção.',
    },
  },
  {
    code: 'CLIENTE_COMPARANDO_CONCORRENTE',
    title: 'Comparando com a concorrência',
    description: 'Cliente menciona ter visto produto parecido em outra loja ou na internet.',
    category: 'OBJECAO',
    objective: 'Reforçar o valor da loja frente à comparação com concorrente/internet, sem falar mal do concorrente.',
    playbookCategorias: ['OBJECOES'],
    criteriosAvaliacao: ['ARGUMENTACAO', 'TRATAMENTO_DE_OBJECOES', 'EXPERIENCIA_DO_CLIENTE'],
    persona: {
      profile: 'Cliente que pesquisa bastante antes de comprar e chega comparando preços.',
      initialNeed: 'Vi um parecido bem mais barato na internet, por que eu compraria aqui?',
      behavior: 'Valoriza argumentos concretos sobre atendimento, garantia e experiência — não só preço.',
      objectionsPool: ['Lá é mais barato.', 'Não sei se aqui tem a mesma qualidade.'],
      hiddenNeeds: ['Prefere comprar numa loja física pra poder trocar com facilidade se precisar.'],
      successCondition: 'O vendedor destaca valor real da compra na loja sem inventar comparação nem falar mal do concorrente.',
    },
  },
  {
    code: 'VENDA_COMPLEMENTAR',
    title: 'Oportunidade de venda complementar',
    description: 'Cliente já decidiu o produto principal — momento de oferecer um complementar.',
    category: 'VENDA_COMPLEMENTAR',
    objective: 'Oferecer um produto complementar de forma natural, coerente com a necessidade da cliente.',
    playbookCategorias: ['VENDA_COMPLEMENTAR'],
    criteriosAvaliacao: ['VENDA_COMPLEMENTAR', 'SONDAGEM'],
    persona: {
      profile: 'Cliente satisfeita com a escolha principal, aberta a sugestões relevantes.',
      initialNeed: 'Adorei esse, vou levar esse mesmo.',
      behavior: 'Aceita bem uma sugestão complementar se fizer sentido com o que ela já escolheu, mas recusa se parecer só "empurrar mais um item".',
      objectionsPool: ['Acho que só isso já resolve pra mim.', 'Não tinha pensado em levar mais nada.'],
      hiddenNeeds: ['Vai precisar de um produto de cuidado/manutenção que combina com o que já escolheu.'],
      successCondition: 'O vendedor sugere o complementar certo, de forma natural, e a cliente aceita.',
    },
  },
  {
    code: 'AUMENTAR_PA',
    title: 'Aumentar peças por atendimento',
    description: 'Cliente comprando um item — oportunidade de aumentar o PA do atendimento.',
    category: 'VENDA_COMPLEMENTAR',
    objective: 'Aumentar o número de peças por atendimento sem parecer insistente.',
    playbookCategorias: ['VENDA_COMPLEMENTAR', 'DEMONSTRACAO'],
    criteriosAvaliacao: ['VENDA_COMPLEMENTAR', 'ARGUMENTACAO'],
    persona: {
      profile: 'Cliente comprando para uma ocasião específica (viagem, festa, trabalho).',
      initialNeed: 'Vou viajar semana que vem e preciso de um sapato confortável.',
      behavior: 'Responde bem quando o vendedor conecta sugestões extras à ocasião mencionada.',
      objectionsPool: ['Acho que só um par já resolve.', 'Não quero gastar muito além do planejado.'],
      hiddenNeeds: ['Vai precisar de mais de um par pra ocasiões diferentes na mesma viagem.'],
      successCondition: 'O vendedor conecta um segundo item à ocasião real da cliente, aumentando o PA de forma genuína.',
    },
  },
  {
    code: 'AUMENTAR_TICKET',
    title: 'Demonstrar valor de um produto premium',
    description: 'Cliente pensando em um produto mais simples — oportunidade de demonstrar valor de um produto de ticket mais alto.',
    category: 'DEMONSTRACAO',
    objective: 'Demonstrar valor de um produto de ticket mais alto antes de falar preço.',
    playbookCategorias: ['DEMONSTRACAO'],
    criteriosAvaliacao: ['ARGUMENTACAO', 'FECHAMENTO'],
    persona: {
      profile: 'Cliente inicialmente pensando em um produto básico.',
      initialNeed: 'Eu queria só um modelo simples, nada muito chamativo.',
      behavior: 'Se interessa por um produto melhor quando entende o benefício real, não só o preço mais alto.',
      objectionsPool: ['Esse aí parece mais caro, não sei se preciso de tanto.', 'Não sei se vale a diferença de preço.'],
      hiddenNeeds: ['Vai usar o produto com frequência e se beneficiaria de mais durabilidade/qualidade.'],
      successCondition: 'O vendedor demonstra valor real do produto premium antes de falar preço, sem forçar a venda.',
    },
  },
  {
    code: 'FECHAMENTO',
    title: 'Conduzir o fechamento',
    description: 'Cliente já convencida — momento de conduzir o fechamento com naturalidade.',
    category: 'FECHAMENTO',
    objective: 'Conduzir o fechamento da venda com naturalidade, sem parecer apressado.',
    playbookCategorias: ['FECHAMENTO'],
    criteriosAvaliacao: ['FECHAMENTO', 'CLAREZA'],
    persona: {
      profile: 'Cliente já convencida do produto, mas ainda não foi convidada a fechar.',
      initialNeed: 'Gostei bastante desse, acho que é esse mesmo.',
      behavior: 'Fecha com facilidade quando o vendedor conduz o próximo passo com clareza.',
      objectionsPool: ['Deixa eu só confirmar uma coisa antes de fechar.'],
      hiddenNeeds: [],
      successCondition: 'O vendedor conduz o fechamento de forma clara e a cliente finaliza a compra.',
    },
  },
  {
    code: 'RECUPERAR_ATENDIMENTO',
    title: 'Recuperar atendimento',
    description: 'Cliente insatisfeita com uma experiência anterior na loja.',
    category: 'POS_VENDA',
    objective: 'Recuperar uma cliente insatisfeita com o atendimento anterior, com empatia genuína.',
    playbookCategorias: ['POS_VENDA', 'CONDUTA'],
    criteriosAvaliacao: ['ESCUTA', 'EXPERIENCIA_DO_CLIENTE'],
    persona: {
      profile: 'Cliente que teve uma experiência ruim numa visita anterior à loja.',
      initialNeed: 'Da última vez que vim aqui, não fui bem atendida.',
      behavior: 'Precisa sentir que foi genuinamente ouvida antes de voltar a confiar na loja.',
      objectionsPool: ['Não sei se quero dar outra chance pra essa loja.', 'Já pensei em nem voltar aqui.'],
      hiddenNeeds: ['No fundo gosta dos produtos da loja e quer uma boa razão pra voltar a confiar.'],
      successCondition: 'O vendedor acolhe a reclamação com empatia, sem prometer nada que não pode cumprir, e recupera a confiança dela.',
    },
  },
  {
    code: 'CLIENTE_COM_OBJECOES_MULTIPLAS',
    title: 'Múltiplas objeções encadeadas',
    description: 'Cliente que levanta uma objeção atrás da outra ao longo da conversa.',
    category: 'OBJECAO',
    objective: 'Lidar com várias objeções encadeadas na mesma conversa sem perder o fio da argumentação.',
    playbookCategorias: ['OBJECOES'],
    criteriosAvaliacao: ['TRATAMENTO_DE_OBJECOES', 'ARGUMENTACAO', 'FECHAMENTO'],
    persona: {
      profile: 'Cliente cautelosa que levanta uma dúvida nova a cada resposta do vendedor.',
      initialNeed: 'Estou olhando, mas tenho bastante dúvida se é isso mesmo que eu quero.',
      behavior: 'Cada objeção resolvida revela uma nova, até se sentir genuinamente segura da escolha.',
      objectionsPool: ['Está caro.', 'Vou pensar mais um pouco.', 'Preciso falar com meu marido/minha esposa antes.'],
      hiddenNeeds: ['No fundo já decidiu que quer comprar, só precisa de segurança pra confirmar.'],
      successCondition: 'O vendedor trata cada objeção com calma e reconecta ao valor, até a cliente se sentir segura pra fechar.',
    },
  },
];

const MAX_TURNS_PADRAO = { EASY: 8, MEDIUM: 11, HARD: 15 };

export async function seedCenariosSimulador() {
  for (const cenario of CENARIOS) {
    const personas = gerarPersonasPorDificuldade(cenario.persona);
    await prisma.simulationScenario.upsert({
      where: { code: cenario.code },
      update: {},
      create: {
        code: cenario.code,
        title: cenario.title,
        description: cenario.description,
        category: cenario.category,
        objective: cenario.objective,
        playbookCategorias: cenario.playbookCategorias,
        criteriosAvaliacao: cenario.criteriosAvaliacao,
        personasPorDificuldade: personas as unknown as Prisma.InputJsonValue,
        maxTurnsPorDificuldade: MAX_TURNS_PADRAO,
      },
    });
  }
  return CENARIOS.length;
}
