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
import { StatusIntervencaoCoach } from '@prisma/client';
import { SourceType, log, registrarIntervencao, transicionarIntervencao, ultimaIntervencaoApresentada } from './intervencao.service';

/** Estados em que uma sugestão ainda pode receber resposta do vendedor. */
const STATUS_RESPONDIVEIS: StatusIntervencaoCoach[] = ['REGISTRADA', 'ACEITA', 'ADIADA'];

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
 *
 * Devolve `true` quando a mensagem FOI mesmo uma resposta a uma sugestão. Quem
 * chama usa isso pra não abrir outra sugestão no mesmo turno — ver
 * `selecionarIntervencaoDoTurno`.
 */
export async function processarRespostaASugestao(params: {
  empresaId: string;
  vendedorId: string;
  conversationId: string;
  mensagem: string;
}): Promise<boolean> {
  try {
    // ALVO EXATO (Etapa 2B.3): a resposta é sobre o que foi APRESENTADO por
    // último nesta conversa — não sobre "alguma pendência".
    //
    // A 2B.2 não sabia disso e, por segurança, não alterava nada quando havia
    // duas pendências. Agora cada turno registra no máximo UMA intervenção, e
    // só depois de a resposta existir — então a mais recente desta conversa é,
    // deterministicamente, a última coisa que o vendedor viu.
    const ultima = await ultimaIntervencaoApresentada(params.vendedorId, params.conversationId);

    // Só sugestão viva pode receber resposta: ninguém "aceita" uma celebração,
    // e um assunto já encerrado não reabre. Se a última coisa apresentada foi
    // outra coisa, não há associação segura — e aí não se altera nada (§48).
    if (!ultima || ultima.tipo !== 'SUGERIU' || !STATUS_RESPONDIVEIS.includes(ultima.status)) return false;

    const resposta = await classificarResposta(params);
    if (resposta === 'INDETERMINADO') return false;

    const alvo = ultima;

    if (resposta === 'DECLAROU_CONCLUSAO') {
      // DECLARAÇÃO ≠ FATO. Só fecha se o sistema comprovar.
      const verificado =
        alvo.sourceId !== null && (await confirmarDeclaracaoDeConclusao(params.vendedorId, alvo.sourceType as SourceType, alvo.sourceId, alvo.ocorridoEm));
      if (verificado) await transicionarIntervencao(alvo.id, params.vendedorId, 'CONCLUIDA');
      // Sem fato: nada é gravado. A fala pode orientar a conversa, mas não
      // cria conclusão, competência, score nem XP. Ainda assim o turno FOI
      // sobre a sugestão — é disso que a conversa está tratando agora.
      return true;
    }

    const novo = { ACEITOU: 'ACEITA', RECUSOU: 'RECUSADA', ADIOU: 'ADIADA' } as const;
    await transicionarIntervencao(alvo.id, params.vendedorId, novo[resposta]);
    return true;
  } catch (err) {
    log.warn({ err, vendedorId: params.vendedorId }, 'falha ao processar resposta a sugestão — estado preservado');
    return false;
  }
}

/**
 * Registra a ÚNICA intervenção que o turno de fato apresentou.
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
export async function registrarIntervencaoApresentada(
  contexto: CoachContext,
  empresaId: string,
  vendedorId: string,
  conversationId: string
): Promise<void> {
  try {
    // A identidade vem da SELEÇÃO feita antes de gerar, não de uma leitura do
    // texto que o modelo produziu. Refazer a escolha aqui seria
    // não-determinístico: o estado pode ter mudado no meio do turno.
    const alvo = contexto.desenvolvimento?.intervencaoDoTurno;
    if (!alvo) return;

    await registrarIntervencao({
      empresaId,
      vendedorId,
      conversationId,
      tipo: alvo.tipo,
      sourceType: alvo.sourceType,
      sourceId: alvo.sourceId,
      metadata: { titulo: alvo.titulo },
    });
  } catch (err) {
    log.warn({ err, vendedorId }, 'falha ao registrar a intervenção do turno — conversa segue normalmente');
  }
}
