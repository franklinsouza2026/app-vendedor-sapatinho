// Celebração (Etapa 2B.1) — o Conselheiro passa a poder reconhecer conquistas
// reais do PRÓPRIO vendedor.
//
// A 2B.0 encontrou `manager/positive-signals.service.ts` detectando 9 tipos de
// coisa boa — e nenhum deles chegava ao Conselheiro: existia motor de
// celebração, ligado só ao gerente. Aqui a FONTE é reaproveitada (os mesmos
// `FeedEvent` da Fatia 8), nunca o motor duplicado.
//
// DUAS DECISÕES DE ESCOPO, registradas em vez de resolvidas no escuro:
//
// 1. Só entram sinais FACTUAIS e sem limiar. `PA_IMPROVEMENT`,
//    `TICKET_IMPROVEMENT` e `STREAK` do serviço do gerente dependem de
//    `LIMIAR_MELHORIA_PERCENTUAL = 15` e `streak >= 3` — limiares calibrados
//    pra montar a lista de destaques de um gerente, não pra decidir o que um
//    conselheiro diz a uma pessoa. Reaproveitá-los seria inventar limiar com
//    legitimidade emprestada (Decisão 172); criar outros está fora do escopo
//    desta fatia.
//
// 2. `BADGE_EARNED` e `MISSION_COMPLETED` ficaram de fora porque o domínio
//    deles é ambíguo: existe badge comercial (`PA_MASTER`) e badge de
//    aprendizagem (`CAMPEAO_DE_TREINAMENTO`), e missão de meta convive com
//    missão de aula. Sem uma classificação determinística do domínio, incluí-los
//    faria performance chegar a uma conversa de acolhimento por via indireta.
import { prisma } from '../db';
import { SinalPositivoDoVendedor } from './context.types';
import { jaTratadoRecentemente } from './intervencao.service';

/**
 * Quanto tempo pra trás um fato ainda merece ser mencionado como novidade.
 *
 * Precisa ser <= COOLDOWN_CELEBRACAO_DIAS: como `ocorridoEm` da intervenção
 * nunca é renovado, se a janela de eventos fosse MAIOR que o cooldown, a
 * conquista voltaria a ser celebrada todo dia no intervalo entre os dois.
 */
const JANELA_DIAS = 7;

/**
 * Por quanto tempo uma conquista JÁ CELEBRADA fica em silêncio (Etapa 2B.2).
 *
 * Antes desta janela o Conselheiro repetia a mesma celebração em toda conversa
 * — comportamento medido: a mesma certificação apareceu idêntica em três
 * conversas seguidas. Celebrar é de primeira classe; virar spam anula isso.
 *
 * Não bloqueia o assunto: se o vendedor perguntar sobre a conquista, a conversa
 * acontece normalmente. O que o cooldown impede é o Conselheiro TRAZER de novo
 * por conta própria.
 */
const COOLDOWN_CELEBRACAO_DIAS = 7;

/**
 * Eventos de DESENVOLVIMENTO: fatos binários, sem limiar, cujo domínio é
 * inequívoco — e que o produto de fato PUBLICA.
 *
 * `TRACK_COMPLETED` ficou de fora de propósito: existe template pra ele em
 * `feed.service.ts`, mas nenhum código do repositório o publica. Incluí-lo
 * seria código que nunca executa fingindo ser funcionalidade.
 *
 * Meta batida (`GOAL_REACHED`) também é fato positivo, mas é comercial — vive
 * no bloco COMERCIAL, não aqui.
 */
const EVENTOS_DE_DESENVOLVIMENTO: Record<string, { rotulo: (nome: string) => string; chaveNome: string }> = {
  // publicado em certification.service.ts com templateData.certificationName
  CERTIFICATION_ISSUED: { rotulo: (n) => `conquistou a certificação${n}`, chaveNome: 'certificationName' },
  // publicado em pdi.service.ts com templateData.competencyName
  PDI_COMPLETED: { rotulo: (n) => `concluiu o plano de desenvolvimento${n}`, chaveNome: 'competencyName' },
};

/** Lê o nome legível do templateData — nunca inventa um quando não existe. */
function nomeDe(dados: Record<string, unknown>, chave: string): string {
  const valor = dados[chave];
  return typeof valor === 'string' && valor.trim().length > 0 ? ` "${valor.trim()}"` : '';
}

/**
 * Conquistas reais do próprio vendedor nos últimos dias.
 *
 * `subjectId` é sempre o vendedor autenticado, resolvido pelo chamador a partir
 * do JWT — nunca de parâmetro do cliente. Devolve lista vazia quando não há
 * nada: **nenhum elogio genérico é fabricado na ausência de fato**
 * (Constituição §10).
 */
export async function listarSinaisPositivosDoVendedor(vendedorId: string, agora: Date = new Date()): Promise<SinalPositivoDoVendedor[]> {
  const desde = new Date(agora.getTime() - JANELA_DIAS * 24 * 60 * 60 * 1000);

  const eventos = await prisma.feedEvent.findMany({
    where: {
      subjectId: vendedorId,
      createdAt: { gte: desde },
      eventType: { in: Object.keys(EVENTOS_DE_DESENVOLVIMENTO) },
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  const desdeCooldown = new Date(agora.getTime() - COOLDOWN_CELEBRACAO_DIAS * 24 * 60 * 60 * 1000);
  const sinais: SinalPositivoDoVendedor[] = [];

  for (const evento of eventos) {
    // Já celebrei este fato com esta pessoa recentemente? Se sim, silêncio —
    // o fato continua verdadeiro, só não é mais novidade.
    if (await jaTratadoRecentemente(vendedorId, 'CELEBROU', 'FEED_EVENT', evento.id, desdeCooldown)) continue;

    const definicao = EVENTOS_DE_DESENVOLVIMENTO[evento.eventType];
    const dados = (evento.templateData ?? {}) as Record<string, unknown>;
    sinais.push({ tipo: evento.eventType, descricao: definicao.rotulo(nomeDe(dados, definicao.chaveNome)), sourceId: evento.id });
  }

  return sinais;
}
