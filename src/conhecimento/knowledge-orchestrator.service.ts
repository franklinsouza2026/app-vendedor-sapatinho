// Orquestração Router → Retriever (Etapa 2C.4).
//
// A única peça que conhece os dois lados, e ela é fina de propósito: o Router
// decide SE e QUAL NECESSIDADE; o Retriever decide QUAL CARD, dentro das
// regras de escopo, estado editorial e precedência da 2C.2. Nenhum dos dois
// faz o trabalho do outro.
//
// Repare onde cada coisa entra: **pertinência não recebe empresa** — o Router
// decide olhando só momento, intenção e as palavras da pessoa. A empresa entra
// depois, no Retriever, porque lá a pergunta é outra: *o que esta empresa pode
// ver?* Separar pertinência de autorização é o que impede uma decidir pela
// outra.
//
// E **o Conselheiro ainda não chama isto**. A 2C.5 é que liga.
import { recuperarConhecimento, ResultadoDeConhecimento } from './knowledge-retriever.service';
import { RotaDeConhecimento, SinalDoTurno, TAGS_POR_TOPICO, rotearConhecimento } from './knowledge-router.service';
import { prisma } from '../db';

export interface ResultadoDoTurno {
  rota: RotaDeConhecimento;
  conhecimento: ResultadoDeConhecimento;
}

/**
 * Roteia e, só se houver rota, recupera.
 *
 * Quando o Router diz `NO_KNOWLEDGE`, **nenhuma consulta acontece** — o
 * silêncio é mais barato que a busca, e é o caso comum. Quando há rota e a
 * biblioteca não tem nada elegível, o resultado continua `NO_KNOWLEDGE`: rota
 * não é promessa de conteúdo.
 */
export async function conhecimentoParaOTurno(
  sinal: SinalDoTurno,
  escopo: { empresaId: string; audience?: 'SELLER' | 'MANAGER' | 'BOTH' }
): Promise<ResultadoDoTurno> {
  const rota = rotearConhecimento(sinal);
  if (rota.tipo === 'NO_KNOWLEDGE') return { rota, conhecimento: { tipo: 'NO_KNOWLEDGE' } };

  const escola = await prisma.escolaUniversidade.findUnique({ where: { code: rota.escola } });
  // Escola configurada e ausente do catálogo é falha de dados, não motivo pra
  // improvisar em outra escola.
  if (!escola) return { rota, conhecimento: { tipo: 'NO_KNOWLEDGE' } };

  const conhecimento = await recuperarConhecimento({
    empresaId: escopo.empresaId,
    escolaId: escola.id,
    audience: escopo.audience ?? 'SELLER',
    // O tópico vira tag aqui — o Retriever nunca soube o que é um tópico, e o
    // Router nunca soube o que é um card.
    tags: TAGS_POR_TOPICO[rota.topico],
  });

  return { rota, conhecimento };
}
