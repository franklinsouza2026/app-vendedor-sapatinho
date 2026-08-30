// Conteúdo inicial da Academia (Fatia 6, seção "CONTEÚDO"/"TRILHAS INICIAIS").
// Todo texto de aula aqui é DEMONSTRATIVO — redação pedagógica própria desta
// implementação, nunca apresentada como "regra oficial da empresa". O
// conteúdo OFICIAL real (os "13 Mandamentos SDL") já vive no Playbook desde
// a Fatia 5 e é exibido JUNTO com a aula via `playbookCategoria` — a aula
// nunca duplica esse texto, só aponta pra ele.
import { CategoriaPlaybook } from '@prisma/client';
import { prisma } from '../db';

interface OpcaoSeed {
  text: string;
  correct: boolean;
}

interface QuizSeed {
  passingScore?: number;
  perguntas: { question: string; opcoes: OpcaoSeed[] }[];
}

interface AulaSeed {
  code: string;
  title: string;
  description: string;
  content: string;
  estimatedMinutes: number;
  playbookCategoria?: CategoriaPlaybook;
  quiz?: QuizSeed;
}

interface TrilhaSeed {
  code: string;
  title: string;
  description: string;
  aulas: AulaSeed[];
}

const TRILHAS: TrilhaSeed[] = [
  {
    code: 'FUNDAMENTOS',
    title: 'Fundamentos do Atendimento',
    description: 'A base de todo bom atendimento: como abrir a conversa e entender o que a cliente realmente precisa.',
    aulas: [
      {
        code: 'FUND_ABERTURA',
        title: 'Como abrir bem um atendimento',
        description: 'Os primeiros 30 segundos definem o tom de todo o atendimento.',
        estimatedMinutes: 4,
        playbookCategoria: 'ABORDAGEM',
        content:
          'CONCEITO: a abertura de um atendimento não é sobre "vender rápido" — é sobre fazer a cliente se sentir bem-vinda antes de qualquer coisa.\n\n' +
          'EXEMPLO: em vez de "Posso ajudar?" (que convida a um "não, só estou olhando"), tente uma saudação genuína seguida de uma apresentação pessoal.\n\n' +
          'APLICAÇÃO PRÁTICA: sorria, cumprimente pelo horário do dia, apresente-se pelo nome antes de perguntar o da cliente.\n\n' +
          'ERRO COMUM: abordar a cliente assim que ela entra na loja, sem dar um instante pra ela se situar no ambiente.\n\n' +
          'DICA: espere alguns segundos, observe o que chamou a atenção dela, e comece por aí.',
        quiz: {
          perguntas: [
            {
              question: 'Qual é o principal risco de perguntar "Posso ajudar?" logo na entrada da cliente?',
              opcoes: [
                { text: 'Ela pode responder "só estou olhando" e encerrar a conversa', correct: true },
                { text: 'É falta de educação', correct: false },
                { text: 'Não existe risco nenhum', correct: false },
              ],
            },
            {
              question: 'O que a aula recomenda fazer antes de abordar a cliente?',
              opcoes: [
                { text: 'Abordar imediatamente, sem esperar', correct: false },
                { text: 'Esperar alguns segundos e observar o que chamou a atenção dela', correct: true },
                { text: 'Ignorar a cliente até que ela chame o vendedor', correct: false },
              ],
            },
          ],
        },
      },
      {
        code: 'FUND_SONDAGEM',
        title: 'Sondar antes de argumentar',
        description: 'Entender a necessidade real da cliente evita apresentar o produto errado.',
        estimatedMinutes: 5,
        playbookCategoria: 'SONDAGEM',
        content:
          'CONCEITO: sondar é descobrir o que a cliente realmente precisa antes de sugerir qualquer produto — sem isso, toda argumentação é um "chute".\n\n' +
          'EXEMPLO: perguntar "pra que ocasião é?" ou "o que você mais gosta de usar no dia a dia?" revela muito mais do que "que número você calça?".\n\n' +
          'APLICAÇÃO PRÁTICA: faça 2-3 perguntas abertas antes de trazer o primeiro produto.\n\n' +
          'ERRO COMUM: trazer vários produtos de uma vez só pra "ver se algum agrada", sem entender a necessidade primeiro.\n\n' +
          'DICA: ouça mais do que fala nos primeiros minutos do atendimento.',
      },
    ],
  },
  {
    code: 'OBJECOES',
    title: 'Quebra de Objeções',
    description: 'Como lidar com dúvidas e resistências da cliente sem parecer na defensiva.',
    aulas: [
      {
        code: 'OBJ_PRECO',
        title: 'Por que a cliente diz "está caro"',
        description: 'Preço alto quase sempre é sobre valor percebido, não sobre o número em si.',
        estimatedMinutes: 5,
        playbookCategoria: 'OBJECOES',
        content:
          'CONCEITO: quando a cliente diz "está caro", raramente é sobre o preço isolado — é sobre não ter enxergado valor suficiente ainda.\n\n' +
          'EXEMPLO: em vez de justificar o preço ou oferecer desconto na hora, reconheça a fala e investigue: "entendo — me conta, comparado com o quê?".\n\n' +
          'APLICAÇÃO PRÁTICA: reconheça, investigue o motivo, reforce o valor real (durabilidade, conforto, atendimento), e só depois volte ao fechamento.\n\n' +
          'ERRO COMUM: oferecer desconto não autorizado só pra "resolver logo" a objeção.\n\n' +
          'DICA: nunca prometa condição comercial que você não tem certeza de que existe — consulte o gerente se precisar.',
        quiz: {
          perguntas: [
            {
              question: 'Segundo a aula, o que geralmente está por trás da objeção "está caro"?',
              opcoes: [
                { text: 'A cliente sempre está blefando', correct: false },
                { text: 'Falta de valor percebido, não o número do preço isolado', correct: true },
                { text: 'A loja está com preço errado', correct: false },
              ],
            },
            {
              question: 'Qual é o erro comum que a aula alerta pra não cometer?',
              opcoes: [
                { text: 'Investigar o motivo da objeção', correct: false },
                { text: 'Oferecer desconto não autorizado só pra resolver rápido', correct: true },
                { text: 'Reforçar o valor real do produto', correct: false },
              ],
            },
          ],
        },
      },
    ],
  },
  {
    code: 'VENDA_COMPLEMENTAR',
    title: 'Venda Complementar e Ticket',
    description: 'Como aumentar PA e ticket médio oferecendo o produto certo, na hora certa.',
    aulas: [
      {
        code: 'VC_AUMENTAR_PA',
        title: 'Aumentando o PA com naturalidade',
        description: 'Oferecer um segundo item só funciona quando faz sentido pra necessidade da cliente.',
        estimatedMinutes: 4,
        playbookCategoria: 'VENDA_COMPLEMENTAR',
        content:
          'CONCEITO: aumentar PA (peças por atendimento) não é "empurrar mais um item" — é completar a solução que a cliente já está buscando.\n\n' +
          'EXEMPLO: se a cliente comprou um sapato pra uma viagem, perguntar sobre outras ocasiões da mesma viagem é natural, não forçado.\n\n' +
          'APLICAÇÃO PRÁTICA: conecte a sugestão complementar à necessidade que a cliente já revelou, nunca a um produto aleatório.\n\n' +
          'ERRO COMUM: oferecer produtos sem nenhuma relação com o que a cliente veio buscar.\n\n' +
          'DICA: pergunte-se "isso resolve algo que ela mencionou?" antes de sugerir.',
      },
      {
        code: 'VC_DEMONSTRAR_VALOR',
        title: 'Demonstrando valor antes do preço',
        description: 'Falar de benefício antes de falar de preço muda como a cliente recebe o valor do produto.',
        estimatedMinutes: 5,
        playbookCategoria: 'DEMONSTRACAO',
        content:
          'CONCEITO: quando o vendedor demonstra características, vantagens e benefícios antes de mencionar o preço, a cliente avalia o produto pelo valor, não só pelo número.\n\n' +
          'EXEMPLO: descrever o material, o conforto e a durabilidade antes de dizer o preço muda completamente a reação da cliente.\n\n' +
          'APLICAÇÃO PRÁTICA: apresente pelo menos 2 benefícios concretos antes de falar valor.\n\n' +
          'ERRO COMUM: informar o preço logo de cara, antes de a cliente entender o que está pagando.\n\n' +
          'DICA: pegue o produto na mão com entusiasmo genuíno ao apresentá-lo — isso comunica valor por si só.',
        quiz: {
          perguntas: [
            {
              question: 'Por que é melhor falar do benefício antes do preço?',
              opcoes: [
                { text: 'Porque assim a cliente esquece o preço', correct: false },
                { text: 'Porque a cliente passa a avaliar o produto pelo valor, não só pelo número', correct: true },
                { text: 'Não faz diferença nenhuma', correct: false },
              ],
            },
          ],
        },
      },
    ],
  },
  {
    code: 'FECHAMENTO_POS_VENDA',
    title: 'Fechamento e Pós-venda',
    description: 'Conduzir o fechamento com naturalidade e cuidar da cliente mesmo depois da compra.',
    aulas: [
      {
        code: 'FPV_FECHAMENTO',
        title: 'Conduzindo o fechamento',
        description: 'Uma cliente convencida nem sempre sabe que já pode fechar — o vendedor precisa conduzir esse momento.',
        estimatedMinutes: 4,
        playbookCategoria: 'FECHAMENTO',
        content:
          'CONCEITO: o fechamento é o momento de conduzir a cliente, com clareza, do "gostei" para o "vou levar".\n\n' +
          'EXEMPLO: perguntas diretas como "vamos fechar esse então?" funcionam melhor do que esperar a cliente tomar a iniciativa sozinha.\n\n' +
          'APLICAÇÃO PRÁTICA: quando perceber sinais de decisão (ela já experimentou, já perguntou sobre pagamento), avance com uma pergunta de fechamento.\n\n' +
          'ERRO COMUM: continuar apresentando mais produtos depois que a cliente já decidiu, gerando dúvida de novo.\n\n' +
          'DICA: reconheça os sinais de decisão e avance — não prolongue o atendimento sem necessidade.',
      },
      {
        code: 'FPV_POS_VENDA',
        title: 'O pós-venda que traz a cliente de volta',
        description: 'A despedida é tão importante quanto a abertura — é o que fica na memória da cliente.',
        estimatedMinutes: 4,
        playbookCategoria: 'POS_VENDA',
        content:
          'CONCEITO: como você se despede da cliente — comprando ou não — define se ela volta.\n\n' +
          'EXEMPLO: agradecer a visita com respeito mesmo quando não houve compra aumenta a chance de retorno.\n\n' +
          'APLICAÇÃO PRÁTICA: acompanhe a cliente até a porta, agradeça pelo nome se souber, e convide-a a voltar.\n\n' +
          'ERRO COMUM: tratar a cliente com menos atenção depois que ela decide não comprar.\n\n' +
          'DICA: trate toda saída como uma oportunidade de fazer a cliente querer voltar.',
        quiz: {
          perguntas: [
            {
              question: 'O que a aula diz sobre uma cliente que não comprou?',
              opcoes: [
                { text: 'Não vale a pena continuar sendo atenciosa com ela', correct: false },
                { text: 'Agradecer a visita com respeito ainda é importante', correct: true },
                { text: 'É melhor ignorá-la ao sair', correct: false },
              ],
            },
          ],
        },
      },
    ],
  },
];

export async function seedConteudoAcademia() {
  let totalAulas = 0;
  for (const trilha of TRILHAS) {
    const trilhaCriada = await prisma.academyTrack.upsert({
      where: { code: trilha.code },
      update: {},
      create: { code: trilha.code, title: trilha.title, description: trilha.description },
    });

    for (const [indice, aula] of trilha.aulas.entries()) {
      const aulaCriada = await prisma.academyLesson.upsert({
        where: { code: aula.code },
        update: {},
        create: {
          trackId: trilhaCriada.id,
          code: aula.code,
          title: aula.title,
          description: aula.description,
          content: aula.content,
          origem: 'DEMONSTRATIVO',
          estimatedMinutes: aula.estimatedMinutes,
          sortOrder: indice,
          playbookCategoria: aula.playbookCategoria,
        },
      });
      totalAulas += 1;

      if (aula.quiz) {
        const quizCriado = await prisma.academyQuiz.upsert({
          where: { lessonId: aulaCriada.id },
          update: {},
          create: { lessonId: aulaCriada.id, passingScore: aula.quiz.passingScore ?? 70 },
        });

        for (const [idxPergunta, pergunta] of aula.quiz.perguntas.entries()) {
          const perguntaExistente = await prisma.academyQuestion.findFirst({ where: { quizId: quizCriado.id, sortOrder: idxPergunta } });
          if (perguntaExistente) continue; // idempotente — não duplica em re-seed

          await prisma.academyQuestion.create({
            data: {
              quizId: quizCriado.id,
              question: pergunta.question,
              sortOrder: idxPergunta,
              opcoes: {
                create: pergunta.opcoes.map((o, idxOpcao) => ({ text: o.text, correct: o.correct, sortOrder: idxOpcao })),
              },
            },
          });
        }
      }
    }
  }

  return { trilhas: TRILHAS.length, aulas: totalAulas };
}
