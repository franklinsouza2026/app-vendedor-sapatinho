// Piloto editorial de HÁBITOS (Etapa 2C.3) — os seis primeiros cards reais.
//
// ESTES CARDS SÃO CANDIDATOS. Nascem e permanecem em `DRAFT` até homologação
// humana: nada aqui aprova, publica ou preenche `approvedBy`. Enquanto forem
// rascunho, o Retriever da 2C.2 devolve `NO_KNOWLEDGE` para Hábitos — e isso é
// o comportamento CORRETO, provado por teste.
//
// POR QUE ESCOPO GLOBAL: é conhecimento geral de desenvolvimento pessoal, não
// política de nenhuma empresa. Cadastrá-los como conteúdo de uma empresa só
// porque o escopo global não tem editor seria mentir para o schema.
//
// SOBRE AS FONTES: todas foram verificadas, nenhuma foi inventada. E a
// classificação é honesta em ambas as direções — o card "uma mudança por vez"
// NÃO é científico, porque a revisão sistemática consultada não sustenta que
// mudar uma coisa de cada vez seja superior. Rotular de ciência o que a
// pesquisa não fechou seria exatamente o que o eixo `tipoFonte` existe pra
// impedir.
//
// TEXTO PRÓPRIO: nenhum trecho é reprodução de livro, artigo ou curso. São
// sínteses redigidas a partir das referências, com a origem registrada.
import { Prisma } from '@prisma/client';

export interface CardDoPiloto {
  chave: string;
  titulo: string;
  principio: string;
  quandoUsar: string;
  quandoNaoUsar: string;
  exemplo: string;
  tipoFonte: Prisma.KnowledgeCardCreateInput['tipoFonte'];
  fonte: string;
  autor: string | null;
  referencia: string;
  licenca: Prisma.KnowledgeCardCreateInput['licenca'];
  notaProvenance: string;
  tags: string[];
}

/** Código da Escola reutilizada — "Rotina, prioridades e produtividade pessoal". */
export const ESCOLA_DO_PILOTO = 'organizacao';

export const PILOTO_HABITOS: CardDoPiloto[] = [
  {
    chave: 'habito-comecar-pequeno',
    titulo: 'Começar pequeno o bastante para caber num dia ruim',
    principio:
      'Quando uma rotina nova não se sustenta, muitas vezes o problema não é falta de vontade: é que a ação combinada é grande demais para um dia comum. Reduzir a ação até um tamanho que caberia até num dia ruim torna a repetição possível. O tamanho pequeno é porta de entrada, não teto — depois que a repetição se firma, dá pra crescer.',
    quandoUsar:
      'A pessoa quer criar uma rotina, começa animada e larga em poucos dias; ou descreve um plano cujo primeiro passo já é grande. O sinal típico é "eu começo empolgado e depois largo".',
    quandoNaoUsar:
      'Quando ela já faz a ação com regularidade e quer avançar — aí o assunto é progressão, não tamanho. Quando o obstáculo é falta de tempo real naquela semana: encolher a ação não resolve e soa como se o problema fosse ela. E quando ela só relatou cansaço, sem pedir caminho.',
    exemplo:
      'Quem quer "estudar o catálogo todo dia" pode começar olhando uma linha de produto antes de abrir a loja. É pequeno o bastante pra acontecer num dia cheio.',
    tipoFonte: 'METODOLOGIA',
    fonte: 'B. J. Fogg — modelo de comportamento B=MAP (Persuasive Technology, 2009), desenvolvido no livro Tiny Habits (2019).',
    autor: 'B. J. Fogg',
    referencia: 'https://www.behaviormodel.org/',
    licenca: 'PROPRIO',
    notaProvenance:
      'Síntese própria da ideia central do modelo: aumentar a facilidade da ação costuma sustentar mais que tentar aumentar a motivação. É modelo de autor, não consenso científico fechado — daí a classificação como metodologia.',
    tags: ['habito', 'comeco', 'rotina'],
  },
  {
    chave: 'habito-ambiente-facilita',
    titulo: 'Ajustar o cenário, não a força de vontade',
    principio:
      'Boa parte do que a gente repete é disparada pelo lugar e pela situação, não por uma decisão consciente a cada vez. Deixar à vista e à mão o que se quer fazer, e colocar um passo a mais de distância no que atrapalha, muda o comportamento sem exigir mais esforço de vontade. É mexer no cenário, não na pessoa.',
    quandoUsar:
      'A pessoa tem intenção clara e mesmo assim não faz, e o relato aponta o contexto: chega em casa e acaba em outra coisa; na loja, o que ela precisaria usar está longe. Sinal típico: "eu quero, mas acabo fazendo outra coisa".',
    quandoNaoUsar:
      'Quando ela não controla o ambiente em questão — loja com regra própria, casa compartilhada, expediente definido por outra pessoa. Sugerir mudar o cenário aí vira cobrança do impossível. Também não serve quando o problema é lembrar da ação, e não a facilidade dela.',
    exemplo:
      'Deixar o material de consulta já aberto no balcão antes de a loja abrir custa menos que lembrar de buscá-lo no meio de um atendimento.',
    tipoFonte: 'CIENTIFICO',
    fonte:
      'Wood, W. & Neal, D. T. (2007). A new look at habits and the habit–goal interface. Psychological Review, 114(4), 843–863. Ver também Neal, Wood, Labrecque & Lally (2012) sobre os gatilhos reais de hábitos no dia a dia.',
    autor: 'Wendy Wood; David T. Neal',
    referencia: 'https://dornsife.usc.edu/wendy-wood/wp-content/uploads/sites/183/2023/10/wood.neal_.2007psychrev_a_new_look_at_habits_and_the_interface_between_habits_and_goals.pdf',
    licenca: 'PROPRIO',
    notaProvenance:
      'Síntese própria. A literatura descreve que comportamentos habituais são acionados por pistas do contexto — lugar, pessoas, ação anterior — e que hábitos fortes respondem mais ao contexto que à intenção do momento.',
    tags: ['habito', 'ambiente', 'contexto'],
  },
  {
    chave: 'habito-gatilho-claro',
    titulo: 'Combinar o momento, não só a intenção',
    principio:
      'Intenção sem momento definido costuma se perder no meio do dia. Decidir antes quando e onde a ação acontece — ancorando em algo que já ocorre todos os dias — aumenta a chance de ela sair do papel. Pesquisas sobre planos do tipo "quando acontecer X, eu faço Y" apontam efeito consistente sobre concretizar o que foi planejado.',
    quandoUsar:
      'A pessoa quer fazer, não tem resistência à tarefa em si, e simplesmente esquece ou vai empurrando. Sinal típico: "eu quero fazer, mas o dia passa e eu não faço".',
    quandoNaoUsar:
      'Quando a rotina dela não tem momento estável onde ancorar — escala que muda, imprevisto constante, expediente irregular. Insistir num horário fixo aí só cria mais uma coisa pra falhar. E quando a ação é grande demais: o problema não é lembrar, é caber.',
    exemplo: '"Depois de fechar o caixa, eu reviso um atendimento do dia" costuma funcionar melhor que "vou revisar meus atendimentos".',
    tipoFonte: 'CIENTIFICO',
    fonte:
      'Gollwitzer, P. M. & Sheeran, P. (2006). Implementation intentions and goal achievement: a meta-analysis of effects and processes. Advances in Experimental Social Psychology, 38, 69–119 — 94 estudos, efeito médio-alto (d = 0,65).',
    autor: 'Peter M. Gollwitzer; Paschal Sheeran',
    referencia: 'https://www.sciencedirect.com/science/chapter/bookseries/abs/pii/S0065260106380021',
    licenca: 'PROPRIO',
    notaProvenance:
      'Síntese própria. O termo técnico é "implementation intentions"; o card usa linguagem comum de propósito. Meta-análise mais recente (2024, 642 testes) encontrou efeitos entre 0,27 e 0,66 — por isso o texto diz "aumenta a chance", nunca "garante".',
    tags: ['habito', 'gatilho', 'rotina'],
  },
  {
    chave: 'habito-consistencia-antes-de-intensidade',
    titulo: 'Firmar a repetição antes de aumentar o volume',
    principio:
      'O que firma uma rotina é repetir na mesma situação, mais do que caprichar em cada vez. No começo vale proteger a frequência e deixar o volume em segundo plano; depois que a ação já acontece quase sem pensar, aumentar faz sentido. Quanto tempo isso leva varia bastante de pessoa pra pessoa e de ação pra ação.',
    quandoUsar:
      'A pessoa já começou, mas faz de forma irregular — muito num dia, nada por uma semana — e quer que aquilo pegue. Ou quer subir o volume antes de a repetição estar firme. Sinal típico: "quando eu faço, faço bastante, mas não é sempre".',
    quandoNaoUsar:
      'Quando ela ainda não começou: aí o assunto é o tamanho do primeiro passo, não a progressão. Quando existe prazo real que exige volume agora. E quando a irregularidade vem de um período específico da vida dela, não do desenho da rotina.',
    exemplo: 'Rever um atendimento por dia sustenta mais que rever dez num domingo e nenhum no resto da semana.',
    tipoFonte: 'CIENTIFICO',
    fonte:
      'Lally, P., van Jaarsveld, C. H. M., Potts, H. W. W. & Wardle, J. (2010). How are habits formed: modelling habit formation in the real world. European Journal of Social Psychology, 40(6), 998–1009.',
    autor: 'Phillippa Lally e cols.',
    referencia: 'https://onlinelibrary.wiley.com/doi/10.1002/ejsp.674',
    licenca: 'PROPRIO',
    notaProvenance:
      'Síntese própria. No estudo, a repetição num contexto estável elevou a automaticidade até um platô, com mediana de 66 dias e variação de 18 a 254 entre participantes. O card evita citar prazo justamente porque a variação é enorme — número único viraria meta e depois cobrança.',
    tags: ['habito', 'consistencia', 'progressao'],
  },
  {
    chave: 'habito-retomar-sem-abandonar',
    titulo: 'Um dia perdido não apaga o que já foi construído',
    principio:
      'Falhar uma vez não desfaz o que já foi construído. No estudo que acompanhou pessoas formando hábitos no dia a dia, pular um dia não prejudicou de forma relevante o progresso — o que atrapalha é transformar o deslize em desistência. Retomar na próxima oportunidade costuma valer mais que tentar compensar em dobro.',
    quandoUsar:
      'A pessoa interrompeu a rotina e trata isso como fracasso: "já perdi", "agora era", "estraguei a sequência". Serve quando o desânimo é com a interrupção em si, não com o objetivo.',
    quandoNaoUsar:
      'Quando a interrupção se repete há muito tempo e o que não cabe na vida dela é o desenho da rotina — aí "volta amanhã" ignora o problema real. E quando a pausa foi escolha consciente dela: retomar não é obrigação, e tratar como recaída é desrespeitoso.',
    exemplo: 'Quem não revisou nada ontem não precisa revisar o dobro hoje. Fazer hoje o de hoje já recoloca a rotina de pé.',
    tipoFonte: 'CIENTIFICO',
    fonte:
      'Lally, P., van Jaarsveld, C. H. M., Potts, H. W. W. & Wardle, J. (2010). How are habits formed: modelling habit formation in the real world. European Journal of Social Psychology, 40(6), 998–1009.',
    autor: 'Phillippa Lally e cols.',
    referencia: 'https://onlinelibrary.wiley.com/doi/10.1002/ejsp.674',
    licenca: 'PROPRIO',
    notaProvenance:
      'Síntese própria. O achado específico usado aqui é o de que deixar de fazer em um dia não comprometeu de forma significativa a trajetória de automaticidade no estudo. O card evita qualquer linguagem de sequência ou streak, coerente com a Constituição do Conselheiro.',
    tags: ['habito', 'retomada', 'recaida'],
  },
  {
    chave: 'habito-uma-mudanca-por-vez',
    titulo: 'Escolher por onde começar quando há muita coisa junta',
    principio:
      'Querer mudar várias coisas ao mesmo tempo divide atenção e energia, e é comum acabar sem nenhuma firmada. Escolher por onde começar reduz essa carga — sem abrir mão do resto, só colocando em ordem. Não é regra: tem gente que dá conta de mais de uma frente, e a pesquisa disponível não aponta um caminho melhor pra todo mundo.',
    quandoUsar:
      'A pessoa apresenta uma lista de mudanças que vai começar de uma vez, muitas vezes com data simbólica ("segunda eu vou..."), e já tentou algo parecido antes sem sustentar.',
    quandoNaoUsar:
      'Quando as mudanças são pequenas e se apoiam umas nas outras. Quando ela está dando conta de várias e só quer conversar sobre isso. E quando o que ela trouxe foi ambição: encurtar a lista de quem está animado, sem necessidade, tira energia em vez de ajudar.',
    exemplo:
      'Diante de "vou acordar mais cedo, estudar produto, treinar abordagem e começar academia", cabe perguntar qual dessas mudaria mais o dia dela se acontecesse já nesta semana.',
    tipoFonte: 'DESENVOLVIMENTO_PESSOAL',
    fonte:
      'James, E. e cols. (2016). Comparative efficacy of simultaneous versus sequential multiple health behavior change interventions among adults: a systematic review of randomised trials. Preventive Medicine.',
    autor: null,
    referencia: 'https://www.sciencedirect.com/science/article/abs/pii/S0091743516301372',
    licenca: 'PROPRIO',
    notaProvenance:
      'Classificado como desenvolvimento pessoal, e NÃO como científico, de propósito: a revisão consultada comparou abordagens simultânea e sequencial e concluiu que a evidência é limitada e as duas se mostraram igualmente eficazes. Ou seja, a pesquisa não sustenta que "uma de cada vez" seja superior. O card oferece uma forma de reduzir sobrecarga, não uma conclusão de pesquisa — e o texto diz isso explicitamente.',
    tags: ['habito', 'prioridade', 'sobrecarga'],
  },
];
