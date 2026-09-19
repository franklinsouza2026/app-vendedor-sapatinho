// Conclusão authoritative (Etapa 2B.2).
//
// REGRA CENTRAL: o que fecha uma sugestão é FATO DE SISTEMA, nunca declaração.
//
// Se o vendedor diz "já fiz a simulação" e existe a sessão avaliada, a
// conclusão é verificada. Se ele diz e NÃO existe, nada é fabricado: a fala
// pode orientar a conversa, mas não cria certificação, competência, score nem
// XP. Dados de sistema continuam a única fonte authoritative de fato — a mesma
// regra que vale para KPI desde a Fatia 4.
//
// O efeito prático, do lado da pessoa: se o sistema já sabe que ela fez, o
// Conselheiro não pergunta "você fez?".
import { prisma } from '../db';
import { MAX_INTERVENCOES_NO_CONTEXTO, SourceType, transicionarIntervencao } from './intervencao.service';

/**
 * Houve, DEPOIS da sugestão, evidência real de que a atividade aconteceu?
 *
 * `desde` é o momento da sugestão: uma aula concluída semanas ANTES não conclui
 * uma sugestão feita hoje — seria creditar à conversa algo que já estava feito.
 */
async function houveConclusaoReal(vendedorId: string, sourceType: SourceType, sourceId: string, desde: Date): Promise<boolean> {
  switch (sourceType) {
    case 'ACADEMY_LESSON':
      return (
        (await prisma.academyProgress.count({
          where: { vendedorId, lessonId: sourceId, status: 'COMPLETED', completedAt: { gte: desde } },
        })) > 0
      );

    case 'SIMULATION_SCENARIO':
      return (
        (await prisma.simulationSession.count({
          where: { vendedorId, scenarioId: sourceId, status: 'EVALUATED', evaluatedAt: { gte: desde } },
        })) > 0
      );

    case 'COMPETENCY':
      // Competência não se "conclui" — evolui por evidência. Uma sugestão de
      // trabalhar uma competência só fecha quando a pessoa faz alguma
      // atividade que gere evidência nova para ela.
      return (
        (await prisma.competencyEvidence.count({
          where: { subjectUserId: vendedorId, competencyId: sourceId, occurredAt: { gte: desde } },
        })) > 0
      );

    // Um evento de feed é um fato já ocorrido, não uma atividade a fazer.
    case 'FEED_EVENT':
      return false;

    default:
      // `sourceType` é String no banco: uma linha com valor fora da união
      // chegaria aqui. Nunca concluir por engano é o lado seguro.
      return false;
  }
}

/**
 * Fecha, por fato de sistema, as sugestões cuja atividade foi de fato feita.
 *
 * Roda na montagem do contexto: é barato (uma contagem por sugestão ativa, e
 * são no máximo 3) e garante que o Conselheiro nunca cobre algo que a pessoa
 * já entregou. Nunca lança — continuidade não pode derrubar a conversa.
 */
export async function reconciliarConclusoes(vendedorId: string): Promise<number> {
  const ativas = await prisma.coachIntervention.findMany({
    where: { vendedorId, tipo: 'SUGERIU', status: { in: ['REGISTRADA', 'ACEITA', 'ADIADA'] } },
    select: { id: true, sourceType: true, sourceId: true, ocorridoEm: true },
    // Mesmo teto da continuidade: só faz sentido reconciliar o que pode virar
    // contexto. Mais que isso seriam round-trips por um dado que ninguém lê.
    take: MAX_INTERVENCOES_NO_CONTEXTO,
  });
  if (ativas.length === 0) return 0;

  // Em paralelo: são poucas, e serializá-las coloca latência no caminho quente
  // de toda mensagem.
  const conclusoes = await Promise.all(
    ativas.map(async (i) => (i.sourceId ? houveConclusaoReal(vendedorId, i.sourceType as SourceType, i.sourceId, i.ocorridoEm) : false))
  );

  let fechadas = 0;
  for (const [indice, concluiu] of conclusoes.entries()) {
    if (concluiu && (await transicionarIntervencao(ativas[indice].id, vendedorId, 'CONCLUIDA'))) fechadas += 1;
  }
  return fechadas;
}

/**
 * O vendedor declarou ter concluído — isto é verdade?
 *
 * Usado quando a classificação da resposta devolve `DECLAROU_CONCLUSAO`.
 * Devolve `false` quando não há fato: aí a conversa segue normalmente, mas
 * nenhuma conclusão é registrada. É a fronteira entre DECLARAÇÃO e FATO.
 */
export async function confirmarDeclaracaoDeConclusao(
  vendedorId: string,
  sourceType: SourceType,
  sourceId: string,
  desde: Date
): Promise<boolean> {
  return houveConclusaoReal(vendedorId, sourceType, sourceId, desde);
}
