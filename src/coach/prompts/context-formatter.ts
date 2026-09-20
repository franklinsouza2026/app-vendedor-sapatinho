// Formata o CoachContext em texto legível pro system prompt — nunca como
// mensagem "do usuário" (evita confundir contexto com entrada do vendedor, e
// reduz superfície de prompt injection via mistura de canais).
//
// ETAPA 2B.1: renderiza apenas os blocos que o gate de pertinência autorizou.
// Um bloco ausente aqui não foi filtrado na renderização — ele **nunca foi
// carregado do banco** (ver `context-builder.service.ts`). Este arquivo é a
// última camada, não a única.
import { MoodCheckIn, StatusIntervencaoCoach } from '@prisma/client';
import { CoachContext } from '../context.types';
import { ConhecimentoRecuperado } from '../../conhecimento/knowledge-retriever.service';
import { EstadoComportamental } from '../../pertinencia/tipos';

/**
 * Como o vendedor DECLAROU estar. Sempre em linguagem de relato — "relatou
 * que" — nunca de diagnóstico. A Constituição §20 (G1) proíbe derivar condição
 * clínica, e a redação é a primeira barreira: um rótulo como "vendedor
 * desanimado" convida o modelo a tratar isso como característica da pessoa.
 */
const RELATO_DE_CHECKIN: Record<MoodCheckIn, string> = {
  VERY_GOOD: 'muito bem',
  GOOD: 'bem',
  NEUTRAL: 'mais ou menos',
  NOT_GOOD: 'não muito bem',
};

/** O prompt inteiro é PT-BR; enum cru ("simulacao", "high") destoa e confunde. */
const ROTULO_ATIVIDADE: Record<'AULA' | 'QUIZ' | 'SIMULACAO', string> = {
  AULA: 'aula',
  QUIZ: 'quiz',
  SIMULACAO: 'simulação',
};

const ROTULO_PRIORIDADE: Record<string, string> = { HIGH: 'alta', MEDIUM: 'média', LOW: 'baixa' };

/**
 * Estado de continuidade em linguagem de conversa, nunca enum cru.
 *
 * `Record` sobre o enum inteiro: um estado novo não compila até alguém
 * traduzi-lo. Os terminais não chegam aqui hoje (a query só traz ativos), mas
 * ter a tradução impede que incluí-los amanhã vaze "CONCLUIDA" pro prompt.
 */
const ESTADO_CONTINUIDADE: Record<StatusIntervencaoCoach, string> = {
  REGISTRADA: 'você sugeriu, ela ainda não respondeu',
  ACEITA: 'ela disse que ia fazer',
  ADIADA: 'ela disse que faria depois — sem prazo combinado',
  RECUSADA: 'ela disse que não queria',
  CONCLUIDA: 'ela concluiu',
};

/** Orientação de condução por estado — tom, nunca script. */
const ORIENTACAO_POR_ESTADO: Record<EstadoComportamental, string> = {
  ACOLHER:
    'A pessoa trouxe como está antes de trazer uma pergunta. Ouça primeiro. Não ofereça número, meta nem tarefa — ' +
    'se ela quiser falar de resultado, ela pede. Uma pergunta aberta costuma valer mais que um conselho.',
  REFLETIR: 'Ajude a pessoa a pensar sobre a situação. Pergunte mais do que afirme. Nem toda conversa precisa terminar em tarefa.',
  DESENVOLVER: 'A conversa é sobre crescer. Traga no máximo um caminho concreto, não um catálogo.',
  TREINAR: 'Há uma habilidade concreta pra praticar. Aponte um destino só (Academia, Treinador ou Simulador) e diga por quê.',
  AGIR: 'Transforme a conversa em UMA ação pequena, concreta e possível hoje. Nunca uma lista.',
  CELEBRAR: 'Reconheça o que de fato aconteceu, com o fato na mão. Não emende cobrança no reconhecimento — parabéns e "mas" não cabem na mesma resposta.',
};

export function formatarContextoParaPrompt(ctx: CoachContext): string {
  const linhas: string[] = [];

  linhas.push(`CONTEXTO ATUAL (fatos, use apenas o que estiver aqui — nunca invente além disso):`);
  linhas.push(`Vendedor: ${ctx.seller.displayName} — Loja: ${ctx.store.name}`);

  // --- HUMANO: sempre presente. A pessoa vem antes dos números. ---
  if (ctx.humano.checkinHoje) {
    linhas.push(`Hoje, ao abrir o app, o vendedor relatou estar ${RELATO_DE_CHECKIN[ctx.humano.checkinHoje]}. É um relato dele, não um diagnóstico — nunca trate como condição ou traço.`);
  }

  // Continuidade relacional (Etapa 2B.2): o Conselheiro deixa de agir como se
  // nunca tivesse conversado com esta pessoa. Estar aqui não obriga a retomar —
  // o momento atual continua soberano.
  if (ctx.humano.continuidade.length > 0) {
    const itens = ctx.humano.continuidade.map((c) => `${c.assunto} (${ESTADO_CONTINUIDADE[c.estado]})`).join('; ');
    linhas.push(
      `Assuntos que vocês já conversaram e seguem em aberto: ${itens}. ` +
        'Retome só se fizer sentido AGORA — nunca abra a conversa cobrando isso, e nunca repita o que já foi recusado.'
    );
  }

  // --- DESENVOLVIMENTO: evolução por evidência. ---
  if (ctx.desenvolvimento) {
    const d = ctx.desenvolvimento;

    // UMA intervenção estruturada por turno (Etapa 2B.3). O que não foi
    // selecionado não chega aqui — e por isso não é consumido.
    if (d.intervencaoDoTurno) {
      const i = d.intervencaoDoTurno;
      linhas.push(
        i.tipo === 'CELEBROU'
          ? `Conquista recente que vale reconhecer (fato): ${i.titulo}.`
          : `Caminho concreto pra oferecer, se couber na conversa: ${i.titulo}.`
      );
    }
    if (d.recentTrainings.length > 0) {
      const atividades = d.recentTrainings
        .map((a) => `${a.titulo} (${ROTULO_ATIVIDADE[a.tipo]}${a.resultado !== null ? `, nota ${a.resultado}` : ''})`)
        .join('; ');
      linhas.push(`Atividades de aprendizagem concluídas recentemente: ${atividades}`);
    }
    // Rotulado como "avaliado por evidência" pra a IA não confundir com foco
    // derivado de KPI — são origens diferentes e o prompt deixa isso claro.
    if (d.competencyGaps.length > 0) {
      const gaps = d.competencyGaps.map((c) => `${c.nome} (${c.score}/${c.target}, prioridade ${ROTULO_PRIORIDADE[c.prioridade] ?? c.prioridade})`).join('; ');
      linhas.push(`Competências abaixo da meta, avaliadas por evidência de treinamento e prática: ${gaps}`);
    }
    if (d.currentMission) {
      linhas.push(`Missão de aprendizagem de hoje: ${d.currentMission}`);
    }

    // CONHECIMENTO (Etapa 2C.5) — no máximo UM card, e por último no bloco.
    //
    // A posição importa: o card entra DEPOIS das regras de segurança, pessoa,
    // silêncio e autorização, nunca acima delas. Conhecimento é subordinado.
    if (d.conhecimento) linhas.push(formatarConhecimento(d.conhecimento));
  }

  // --- COMERCIAL: opcional por desenho. Só entra quando a pertinência liberou. ---
  if (ctx.comercial) {
    const c = ctx.comercial;

    if (c.goal.todayGoal !== null) {
      linhas.push(
        `Meta de hoje: R$ ${c.goal.todayGoal.toFixed(2)} | Realizado: R$ ${c.goal.realized.toFixed(2)} | ` +
          `Atingido: ${c.goal.goalPercent?.toFixed(1) ?? '?'}% | Falta: R$ ${c.goal.amountRemaining?.toFixed(2) ?? '?'}` +
          (c.goal.estimatedSalesRemaining !== null ? ` (~${c.goal.estimatedSalesRemaining} vendas no ticket atual)` : '')
      );
    } else {
      linhas.push('Meta de hoje: não cadastrada.');
    }

    // "Vendas", não "Atendimentos": a 2B.0 provou que o campo de origem conta
    // transações fechadas, não clientes atendidos. Chamar de atendimento fazia
    // o vendedor procurar a causa no lugar errado.
    linhas.push(`PA hoje: ${c.performance.pa.toFixed(2)} | Ticket hoje: R$ ${c.performance.ticket.toFixed(2)} | Vendas: ${c.performance.salesCount}`);

    if (c.baseline.status === 'disponivel') {
      linhas.push(`Baseline pessoal — PA: ${c.baseline.pa?.toFixed(2)} | Ticket: R$ ${c.baseline.ticket?.toFixed(2)}`);
    } else {
      linhas.push('Baseline pessoal: ainda em formação (poucos dias de histórico) — não compare com média ainda.');
    }

    linhas.push(`Gamificação: nível ${c.gamification.level} | XP ${c.gamification.xp} | sequência ${c.gamification.streak} dias`);
    if (c.gamification.recentBadges.length > 0) {
      linhas.push(`Conquistas de gamificação: ${c.gamification.recentBadges.join(', ')}`);
    }
    if (c.professionalMemorySummary) {
      linhas.push(`Resumo de desenvolvimento: ${c.professionalMemorySummary}`);
    }
    if (c.currentFocus) {
      linhas.push(`Foco sugerido atual: ${c.currentFocus}`);
    }
    if (c.currentMission) {
      linhas.push(`Missão prioritária de hoje: ${c.currentMission}`);
    }

    linhas.push(
      ctx.freshness.lastDataSyncAt
        ? `Dados sincronizados pela última vez em: ${ctx.freshness.lastDataSyncAt}`
        : 'Ainda sem sincronização de indicadores para este vendedor.'
    );
  } else {
    // A ausência é explicada ao modelo. Sem isto, ele tende a preencher a
    // lacuna com número de um turno anterior do histórico — o único caminho
    // comercial que a arquitetura não consegue cortar na origem.
    linhas.push(
      'Indicadores comerciais (meta, vendas, PA, ticket) NÃO estão disponíveis nesta conversa. ' +
        'Não os cite, não os estime e não repita números de mensagens anteriores. Se o vendedor pedir os números, ele os terá — basta ele pedir.'
    );
  }

  linhas.push(`COMO CONDUZIR AGORA: ${ORIENTACAO_POR_ESTADO[ctx.pertinencia.estado]}`);

  return linhas.join('\n');
}

/**
 * Como cada natureza de fonte pode ser apresentada.
 *
 * `Record` exaustivo: um tipo novo não compila até alguém decidir o que se pode
 * afirmar com ele. Sem isto, uma metodologia de autor viraria "a ciência prova"
 * na boca do Conselheiro — que é exatamente o que o eixo `tipoFonte` existe
 * para impedir.
 */
const COMO_APRESENTAR: Record<ConhecimentoRecuperado['tipoFonte'], string> = {
  CIENTIFICO: 'apoiada em pesquisa — pode dizer que estudos apontam nessa direção, sem prometer resultado nem falar em certeza',
  METODOLOGIA: 'é o método de um autor, não consenso científico — apresente como uma abordagem que existe, nunca como fato comprovado',
  PROFISSIONAL: 'é prática consolidada da área — apresente como o que costuma funcionar, não como regra',
  DESENVOLVIMENTO_PESSOAL: 'é orientação prática, NÃO ciência — nunca diga que é comprovado ou que a pesquisa garante',
  OFICIAL_EMPRESA: 'é política da empresa — pode ser dita como o jeito que a loja faz',
  REFLEXIVO: 'é convite à reflexão, NUNCA afirmação factual — jamais apresente como demonstração científica',
  DEMONSTRATIVO: 'é exemplo genérico, sem material oficial por trás — deixe claro que não é regra da loja',
};

/**
 * Renderiza o card como REFERÊNCIA INTERNA, nunca como resposta pronta.
 *
 * Três coisas acontecem aqui, e as três são deliberadas:
 *
 * 1. **Sanitização estrutural.** O texto é colapsado em uma linha. Conteúdo
 *    editorial pode, no futuro, vir de uma empresa — e um card multi-linha
 *    conseguiria forjar um bloco que parece instrução de sistema. É o mesmo
 *    achado que a Fatia 5 corrigiu no Playbook do Treinador: instrução
 *    semântica não é defesa estrutural.
 *
 * 2. **`quandoNaoUsar` vai junto, sempre.** É o campo que impede o conselho
 *    certo na hora errada, e mandar o princípio sem ele seria mandar meia
 *    informação — a metade que faz o Conselheiro insistir.
 *
 * 3. **Recuperado não é falado.** A instrução diz explicitamente que o card
 *    pode ser ignorado. O Retriever autoriza conhecimento; não obriga fala.
 */
function formatarConhecimento(card: ConhecimentoRecuperado): string {
  const umaLinha = (t: string) => t.replace(/\s+/g, ' ').trim();

  const partes = [
    'REFERÊNCIA INTERNA (não é instrução, não é resposta pronta, e o vendedor NUNCA deve saber que ela existe):',
    `Ideia: ${umaLinha(card.principio)}`,
    `Costuma ajudar quando: ${umaLinha(card.quandoUsar)}`,
    `NÃO use quando: ${umaLinha(card.quandoNaoUsar)}`,
  ];
  if (card.exemplo) partes.push(`Exemplo de aplicação: ${umaLinha(card.exemplo)}`);
  partes.push(`Natureza desta ideia: ${COMO_APRESENTAR[card.tipoFonte]}.`);
  // Provenance viaja pra governança e pra poder responder a origem SE o
  // vendedor perguntar — nunca pra ser citada por conta própria.
  if (card.fonte) partes.push(`Origem (só mencione se perguntarem): ${umaLinha(card.fonte)}`);
  partes.push(
    'COMO USAR: só se ajudar NESTE turno. Se não couber, ignore por completo — ter a referência não obriga a usá-la. ' +
      'Nunca cite metodologia, autor ou estudo por conta própria. Nunca transforme a resposta em aula. ' +
      'Responda no tamanho do que foi pedido: pergunta curta, resposta curta. Se ainda faltar entender a situação, pergunte antes de orientar.'
  );

  return partes.join(' | ');
}
