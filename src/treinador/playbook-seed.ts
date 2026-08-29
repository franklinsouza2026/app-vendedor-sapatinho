// Conteúdo inicial do Playbook (seção 10 da Fatia 5).
//
// As seções OFICIAL abaixo vêm, palavra por palavra (com só limpeza de
// espaçamento de extração), do material de treinamento real da empresa:
// "[SDL]-13-Mandamentos.pptx" (SDL = Sapatinho de Luxo), encontrado em
// inspeção do ambiente do usuário antes de escrever qualquer conteúdo desta
// fatia — nada aqui foi inventado. O material cobre acolhimento, sondagem,
// demonstração, venda complementar, fechamento e conduta, mas NÃO cobre
// quebra de objeções nem argumentação — pra essas categorias não existe
// regra oficial da empresa ainda, então a seção correspondente é marcada
// DEMONSTRATIVO (boa prática genérica de vendas, nunca apresentada ao
// vendedor como política da loja — seção 10/14 da Fatia 5).
import { CategoriaPlaybook, OrigemConteudoPlaybook } from '@prisma/client';
import { getPlaybookAtivo, criarPlaybookDraft, publicarPlaybook, SecaoParaCriar } from './playbook.service';

export const SECOES_PLAYBOOK_INICIAL_SDL: SecaoParaCriar[] = [
  {
    categoria: CategoriaPlaybook.ABORDAGEM,
    titulo: 'Mandamento #1 — Recepção',
    origem: OrigemConteudoPlaybook.OFICIAL,
    conteudo:
      'Receberei a cliente com positividade, gentileza e um sorriso encantador. A saudarei com entusiasmo: Bom dia/tarde/noite, seja bem-vinda(o) à Sapatinho de Luxo.',
  },
  {
    categoria: CategoriaPlaybook.ABORDAGEM,
    titulo: 'Mandamento #2 — Apresentação',
    origem: OrigemConteudoPlaybook.OFICIAL,
    conteudo: 'Me apresentarei dizendo "Eu sou ....." e logo em seguida perguntarei à cliente "Seu nome é?".',
  },
  {
    categoria: CategoriaPlaybook.SONDAGEM,
    titulo: 'Mandamento #3 — Sondagem de necessidades',
    origem: OrigemConteudoPlaybook.OFICIAL,
    conteudo: 'Sondarei as necessidades e expectativas da cliente, a fim de entender o que a motiva a comprar.',
  },
  {
    categoria: CategoriaPlaybook.DEMONSTRACAO,
    titulo: 'Mandamento #5 — Apresentação do produto',
    origem: OrigemConteudoPlaybook.OFICIAL,
    conteudo:
      'Ao apresentar os produtos à cliente, demonstrarei conhecimento e apresentarei características, vantagens e benefícios deles. Aos produtos destaque, pegarei na mão com entusiasmo, apresentando-o mais de perto à cliente.',
  },
  {
    categoria: CategoriaPlaybook.DEMONSTRACAO,
    titulo: 'Mandamento #7 — Ajudar a calçar',
    origem: OrigemConteudoPlaybook.OFICIAL,
    conteudo: 'Se a cliente me permitir, ajudarei com gentileza ela a calçar os produtos.',
  },
  {
    categoria: CategoriaPlaybook.VENDA_COMPLEMENTAR,
    titulo: 'Mandamento #6 — Produtos similares',
    origem: OrigemConteudoPlaybook.OFICIAL,
    conteudo: 'Sempre trarei do estoque, além do produto escolhido pela cliente, mais modelos de produtos similares aos que ela escolheu.',
  },
  {
    categoria: CategoriaPlaybook.FECHAMENTO,
    titulo: 'Mandamento #9 — Despedida',
    origem: OrigemConteudoPlaybook.OFICIAL,
    conteudo:
      'SEMPRE acompanharei a cliente até a porta da loja e direi sorrindo a ela: Espero vê-la(o) em breve na Sapatinho de Luxo, tenha um ótimo bom dia/tarde/noite.',
  },
  {
    categoria: CategoriaPlaybook.POS_VENDA,
    titulo: 'Mandamento #10 — Agradecimento mesmo sem compra',
    origem: OrigemConteudoPlaybook.OFICIAL,
    conteudo:
      'Mesmo que a cliente não realize uma compra, agradecerei sua visita com respeito: Estamos felizes com sua visita e esperamos vê-la(o) em breve na Sapatinho de Luxo, tenha um ótimo bom dia/tarde/noite.',
  },
  {
    categoria: CategoriaPlaybook.CONDUTA,
    titulo: 'Mandamento #4 — Anfitrião',
    origem: OrigemConteudoPlaybook.OFICIAL,
    conteudo: 'Serei um bom anfitrião! Oferecerei água à cliente e às pessoas que a acompanham.',
  },
  {
    categoria: CategoriaPlaybook.CONDUTA,
    titulo: 'Mandamento #8 — Pedir ajuda ao gerente',
    origem: OrigemConteudoPlaybook.OFICIAL,
    conteudo: 'Quando a cliente perguntar algo que eu não saiba, pedirei licença e solicitarei orientação ao gerente.',
  },
  {
    categoria: CategoriaPlaybook.CONDUTA,
    titulo: 'Mandamento #11 — Bom anfitrião com todas as clientes',
    origem: OrigemConteudoPlaybook.OFICIAL,
    conteudo:
      'Serei um bom anfitrião com todas as clientes da loja. Sempre que uma cliente se aproximar de mim, direi sorrindo "Bom dia/tarde/noite". Caso meu colega tenha ido ao estoque no momento do atendimento, perguntarei se ela precisa de mais alguma coisa. Mas jamais me afastarei da cliente que estou atendendo sem pedir licença.',
  },
  {
    categoria: CategoriaPlaybook.CONDUTA,
    titulo: 'Mandamento #12 — Loja organizada',
    origem: OrigemConteudoPlaybook.OFICIAL,
    conteudo:
      'A loja também é minha casa, por isso a manterei com o melhor visual e energia. Sempre zelarei pelas vitrines, prateleiras internas e estoques limpos e organizados.',
  },
  {
    categoria: CategoriaPlaybook.CONDUTA,
    titulo: 'Mandamento #13 — Atenção redobrada com concorrência',
    origem: OrigemConteudoPlaybook.OFICIAL,
    conteudo:
      'Quando uma cliente chegar na loja com uma sacola da concorrência, redobrarei a atenção aos mandamentos SDL, garantindo uma experiência de atendimento ainda mais encantadora.',
  },
  // DEMONSTRATIVO — nenhum material oficial da empresa cobre quebra de
  // objeções ainda (seção 10 da Fatia 5: "não inventar mandamentos da
  // empresa"). Isto é infraestrutura mínima, claramente não-oficial.
  {
    categoria: CategoriaPlaybook.OBJECOES,
    titulo: 'PLAYBOOK_BASE_DEMONSTRATIVO — Estrutura geral de quebra de objeção',
    origem: OrigemConteudoPlaybook.DEMONSTRATIVO,
    conteudo:
      'Boa prática geral de vendas (não é regra oficial da loja): reconheça o que a cliente disse sem contestar; investigue com uma pergunta aberta o motivo real por trás da objeção; responda com informação concreta e relevante; reconecte a resposta com a necessidade que a cliente já demonstrou; avance para o próximo passo (nova pergunta, demonstração ou fechamento). Nunca invente desconto, prazo, garantia ou condição que não esteja confirmada pela loja.',
  },
];

export async function seedPlaybookInicialSeNaoExistir(empresaId: string, publicadoPor: string) {
  const existente = await getPlaybookAtivo(empresaId);
  if (existente) return existente; // idempotente — não cria versão nova a cada `npm run seed`

  const draft = await criarPlaybookDraft(empresaId, 'Sapatinho de Luxo — Playbook de Atendimento', SECOES_PLAYBOOK_INICIAL_SDL);
  return publicarPlaybook(draft.id, empresaId, publicadoPor);
}
