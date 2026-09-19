// Orquestração da continuidade relacional (Etapa 2B.2).
//
// Junta as três peças no fluxo da conversa:
//   1. ANTES de responder — a resposta do vendedor a uma sugestão pendente
//      move (ou não) o estado dela;
//   2. DEPOIS de montar o contexto — o que o sistema colocou na frente do
//      Conselheiro vira registro, pra não ser repetido amanhã.
//
// Nada aqui pode derrubar a conversa: continuidade é um bônus, não um
// requisito. Toda falha é logada e engolida.
import { CoachContext } from './context.types';
import { classificarResposta } from './resposta-classificador.service';
import { confirmarDeclaracaoDeConclusao } from './conclusao.service';
import { SourceType, listarContinuidadeRelevante, log, registrarIntervencao, transicionarIntervencao } from './intervencao.service';

/**
 * A mensagem do vendedor responde a alguma sugestão pendente?
 *
 * Só roda quando existe sugestão viva — sem pendência não há o que classificar,
 * e a chamada de IA é evitada.
 *
 * **AMBIGUIDADE NÃO ALTERA ESTADO.** `INDETERMINADO` (inclusive por falha de
 * provider) deixa tudo como está: o custo de deixar aberto por mais um dia é
 * inofensivo; marcar como recusado o que não foi apaga algo que a pessoa ainda
 * queria.
 */
export async function processarRespostaASugestao(params: {
  empresaId: string;
  vendedorId: string;
  conversationId: string;
  mensagem: string;
}): Promise<void> {
  try {
    // Só é "resposta" o que vem na MESMA conversa em que a sugestão foi feita,
    // e só quando há exatamente UMA pendência ali.
    //
    // Sem esses dois cortes, qualquer mensagem futura era lida como resposta a
    // uma sugestão antiga: um desabafo viraria recusa terminal, e com duas
    // pendências o estado iria parar no assunto errado (a ordenação é por data
    // de criação, não pela última apresentada).
    const pendentes = (await listarContinuidadeRelevante(params.vendedorId)).filter((i) => i.conversationId === params.conversationId);
    if (pendentes.length !== 1) return;

    const resposta = await classificarResposta(params);
    if (resposta === 'INDETERMINADO') return;

    const alvo = pendentes[0];

    if (resposta === 'DECLAROU_CONCLUSAO') {
      // DECLARAÇÃO ≠ FATO. Só fecha se o sistema comprovar.
      const verificado =
        alvo.sourceId !== null && (await confirmarDeclaracaoDeConclusao(params.vendedorId, alvo.sourceType as SourceType, alvo.sourceId, alvo.ocorridoEm));
      if (verificado) await transicionarIntervencao(alvo.id, params.vendedorId, 'CONCLUIDA');
      // Sem fato: nada é gravado. A fala pode orientar a conversa, mas não
      // cria conclusão, competência, score nem XP.
      return;
    }

    const novo = { ACEITOU: 'ACEITA', RECUSOU: 'RECUSADA', ADIOU: 'ADIADA' } as const;
    await transicionarIntervencao(alvo.id, params.vendedorId, novo[resposta]);
  } catch (err) {
    log.warn({ err, vendedorId: params.vendedorId }, 'falha ao processar resposta a sugestão — estado preservado');
  }
}

/**
 * Registra o que o sistema efetivamente colocou na frente do Conselheiro.
 *
 * O que se registra é a decisão do BACKEND (quais fatos foram disponibilizados
 * em que estado), não uma leitura do texto que o LLM produziu — parsear a saída
 * do modelo seria inferência frágil, e é justamente o que esta camada existe
 * pra evitar.
 *
 * Consequência honesta e assumida: se o Conselheiro receber um fato e escolher
 * não mencioná-lo (SABER ≠ FALAR), ele conta como tratado. O custo disso é
 * pequeno perto do inverso — repetir a mesma celebração indefinidamente, que é
 * o comportamento medido antes desta etapa.
 */
export async function registrarIntervencoesDoTurno(contexto: CoachContext, empresaId: string, vendedorId: string, conversationId: string): Promise<void> {
  try {
    // A condição é "o backend colocou o fato na frente do Conselheiro", NÃO o
    // estado comportamental.
    //
    // Amarrar ao estado deixava o bug vivo no caminho mais comum: os sinais
    // positivos são renderizados sempre que o domínio DESENVOLVIMENTO está
    // autorizado (REFLETIR, DESENVOLVER, TREINAR), e não só em CELEBRAR. Um
    // "oi, tudo bem?" cai em REFLETIR, o Conselheiro celebra a certificação —
    // e nada era registrado. No dia seguinte, idêntico. Era exatamente o
    // comportamento medido que esta fatia existe pra matar.
    if (contexto.desenvolvimento) {
      for (const sinal of contexto.desenvolvimento.positiveSignals) {
        await registrarIntervencao({
          empresaId,
          vendedorId,
          conversationId,
          tipo: 'CELEBROU',
          sourceType: 'FEED_EVENT',
          sourceId: sinal.sourceId,
          metadata: { titulo: sinal.descricao },
        });
      }
    }

    // SUGERIU — só quando há alvo CONCRETO E IDENTIFICÁVEL. Uma frase solta
    // ("talvez seja bom descansar") nunca vira compromisso estruturado.
    if (contexto.desenvolvimento) {
      const alvo = contexto.desenvolvimento.competencyGaps[0];
      if (alvo) {
        // Id vindo direto da matriz — `Competency.name` não é único (só `code`
        // é), então procurar por nome escolheria uma competência arbitrária
        // entre homônimas, e ainda gastaria uma query.
        await registrarIntervencao({
          empresaId,
          vendedorId,
          conversationId,
          tipo: 'SUGERIU',
          sourceType: 'COMPETENCY',
          sourceId: alvo.competencyId,
          metadata: { titulo: `trabalhar ${alvo.nome}` },
        });
      }
    }
  } catch (err) {
    log.warn({ err, vendedorId }, 'falha ao registrar intervenções do turno — conversa segue normalmente');
  }
}
