// Insere os rascunhos do piloto de Hábitos (Etapa 2C.3).
//
// EXECUÇÃO MANUAL, de plataforma. Não está no `npm run seed` e não roda em
// deploy: é o mesmo caminho que a 2C.1 registrou como legítimo para conteúdo
// GLOBAL — "entra por seed/script de plataforma, mesmo caminho do Playbook,
// que também só é populado assim".
//
// O QUE ELE FAZ: cria (ou atualiza) os seis cards em `DRAFT`, escopo GLOBAL.
//
// O QUE ELE NUNCA FAZ: submeter, aprovar, publicar ou preencher `approvedBy`.
// `createdBy` fica `null` de propósito — nenhum vendedor escreveu isto, e
// inventar um autor seria forjar ator. Enquanto forem rascunho, o Retriever
// devolve `NO_KNOWLEDGE`, que é o comportamento correto.
//
// Idempotente: rodar de novo atualiza o conteúdo do rascunho, nunca duplica e
// nunca mexe no estado editorial de um card que já tenha avançado.
import { prisma } from '../src/db';
import { ESCOLA_DO_PILOTO, PILOTO_HABITOS } from '../src/conhecimento/piloto-habitos';

async function main() {
  const escola = await prisma.escolaUniversidade.findUnique({ where: { code: ESCOLA_DO_PILOTO } });
  if (!escola) {
    throw new Error(`Escola "${ESCOLA_DO_PILOTO}" não encontrada — rode o seed do catálogo antes.`);
  }

  let criados = 0;
  let atualizados = 0;
  let preservados = 0;

  for (const card of PILOTO_HABITOS) {
    const existente = await prisma.knowledgeCard.findFirst({ where: { chave: card.chave, empresaId: null } });

    // Um card que já saiu de DRAFT foi tocado por decisão humana. O script não
    // desfaz isso nem sobrescreve o texto por baixo de uma aprovação.
    if (existente && existente.status !== 'DRAFT') {
      preservados += 1;
      continue;
    }

    const dados = {
      escolaId: escola.id,
      empresaId: null,
      titulo: card.titulo,
      principio: card.principio,
      quandoUsar: card.quandoUsar,
      quandoNaoUsar: card.quandoNaoUsar,
      exemplo: card.exemplo,
      tipoFonte: card.tipoFonte,
      fonte: card.fonte,
      autor: card.autor,
      referencia: card.referencia,
      licenca: card.licenca,
      notaProvenance: card.notaProvenance,
      audience: 'BOTH' as const,
      origemEditorial: 'ADMIN_CURATED' as const,
      tags: card.tags,
      status: 'DRAFT' as const,
    };

    if (existente) {
      await prisma.knowledgeCard.update({ where: { id: existente.id }, data: dados });
      atualizados += 1;
    } else {
      await prisma.knowledgeCard.create({ data: { chave: card.chave, ...dados } });
      criados += 1;
    }
  }

  const emDraft = await prisma.knowledgeCard.count({ where: { empresaId: null, status: 'DRAFT' } });
  const publicados = await prisma.knowledgeCard.count({ where: { status: 'PUBLISHED' } });

  console.log(
    `\nPiloto Hábitos: ${criados} criado(s), ${atualizados} atualizado(s), ${preservados} preservado(s) por já terem avançado.\n` +
      `Rascunhos globais no banco: ${emDraft}. Cards PUBLICADOS: ${publicados} (esperado 0 — homologação é humana).\n`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
