// Publicação do piloto de Hábitos por OPERAÇÃO ADMINISTRATIVA DE PLATAFORMA
// (Etapa 2C.3C).
//
// POR QUE ISTO É UM SCRIPT E NÃO UMA ROTA: conhecimento GLOBAL pertence à
// plataforma, e a plataforma ainda não tem interface. Criar um login e um stack
// de autenticação para uma autoridade que não teria onde ser usada seria
// construir superfície de ataque sem função. Quem executa isto precisa de
// acesso ao servidor — que é outro nível de controle, não uma permissão de
// aplicação.
//
// O QUE ELE NÃO FAZ: não cria conta, não forja JWT, não insere um `Vendedor`
// temporário, não mexe em `status` direto no banco e não aceita `approvedBy`
// vindo de fora. Cada card atravessa o ciclo real pelos services —
// `DRAFT → REVIEW_PENDING → APPROVED → PUBLISHED`.
//
// USO:
//   npm run publicar:piloto-habitos -- --ator "Nome Completo" --confirmar
//   npm run publicar:piloto-habitos -- --ator "Nome Completo"   (só simula)
import { prisma } from '../src/db';
import { AtorDePlataforma, transicionarCard } from '../src/conhecimento/knowledge-card.service';
import { recuperarConhecimento } from '../src/conhecimento/knowledge-retriever.service';
import { ESCOLA_DO_PILOTO, PILOTO_HABITOS } from '../src/conhecimento/piloto-habitos';

function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** As seis chaves exatas. Nada fora desta lista é tocado. */
const CHAVES = PILOTO_HABITOS.map((c) => c.chave);

/**
 * Resolve — ou cria — a identidade de plataforma de quem autoriza.
 *
 * O nome vem por argumento porque é dado humano: o script nunca escolhe quem
 * assina. O id é opaco e estável, e é ele que vai para `approvedBy` e amarra os
 * eventos de auditoria da mesma pessoa entre execuções.
 */
async function resolverAtor(nome: string): Promise<AtorDePlataforma> {
  const limpo = nome.trim();
  if (limpo.length < 3) throw new Error('Informe o nome completo de quem autoriza.');

  // Nomes de ferramenta ou de sistema derrotam o propósito: o ponto é existir
  // um humano responsável pelo que entrou em produção.
  if (/^(system|admin|root|cli|claude|chatgpt|openai|bot|ia|ai)$/i.test(limpo)) {
    throw new Error(`"${limpo}" não é uma pessoa. A autoridade de plataforma precisa de um responsável humano.`);
  }

  const existente = await prisma.platformActor.findUnique({ where: { nome: limpo } });
  if (existente) {
    if (!existente.ativo) throw new Error(`A autoridade de plataforma de ${limpo} está inativa.`);
    return { platformActorId: existente.id, nome: existente.nome };
  }

  const criado = await prisma.platformActor.create({ data: { nome: limpo } });
  console.log(`\nAutoridade de plataforma registrada: ${criado.nome} (${criado.id}).`);
  return { platformActorId: criado.id, nome: criado.nome };
}

async function main() {
  const nome = argumento('ator');
  const confirmar = process.argv.includes('--confirmar');

  if (!nome) {
    console.error(
      '\nInforme QUEM autoriza — o script nunca assina por ninguém.\n\n' +
        '  npm run publicar:piloto-habitos -- --ator "Nome Completo" --confirmar\n\n' +
        'Sem --confirmar, ele só mostra o que faria.\n'
    );
    process.exitCode = 1;
    return;
  }

  const escola = await prisma.escolaUniversidade.findUnique({ where: { code: ESCOLA_DO_PILOTO } });
  if (!escola) throw new Error(`Escola "${ESCOLA_DO_PILOTO}" não encontrada.`);

  const cards = await prisma.knowledgeCard.findMany({ where: { chave: { in: CHAVES }, empresaId: null } });

  // Falha fechado: publicar "quase todos" deixaria a biblioteca num estado que
  // ninguém pediu e que é difícil de perceber depois.
  if (cards.length !== CHAVES.length) {
    throw new Error(`Esperava ${CHAVES.length} cards do piloto, encontrei ${cards.length}. Rode "npm run seed:piloto-habitos" antes.`);
  }
  const foraDaEscola = cards.filter((c) => c.escolaId !== escola.id);
  if (foraDaEscola.length > 0) throw new Error(`Cards fora da escola do piloto: ${foraDaEscola.map((c) => c.chave).join(', ')}`);

  const jaPublicados = cards.filter((c) => c.status === 'PUBLISHED');
  const pendentes = cards.filter((c) => c.status !== 'PUBLISHED' && c.status !== 'ARCHIVED');
  const arquivados = cards.filter((c) => c.status === 'ARCHIVED');
  if (arquivados.length > 0) throw new Error(`Há card arquivado no piloto: ${arquivados.map((c) => c.chave).join(', ')}. Decisão humana.`);

  console.log(`\nPiloto de Hábitos — escola "${escola.name}"`);
  console.log(`  já publicados: ${jaPublicados.length}`);
  console.log(`  a publicar:    ${pendentes.length}`);
  for (const c of pendentes) console.log(`    · ${c.chave} (${c.status})`);

  const antes = await recuperarConhecimento({ empresaId: (await prisma.empresa.findFirstOrThrow()).id, escolaId: escola.id, audience: 'SELLER' });
  console.log(`\n  Retriever ANTES: ${antes.tipo}`);

  if (!confirmar) {
    console.log('\nSimulação. Nada foi alterado. Repita com --confirmar para publicar de verdade.\n');
    return;
  }
  if (pendentes.length === 0) {
    console.log('\nNada a fazer — os seis já estão publicados.\n');
    return;
  }

  const ator = await resolverAtor(nome);
  console.log(`\nAutorizado por: ${ator.nome}\n`);

  // CICLO REAL, pelos services. Nenhum UPDATE de status direto: as transições
  // validam o estado de origem, registram auditoria e preenchem `approvedBy`
  // com a identidade do ator — que nunca vem do payload.
  for (const card of pendentes) {
    const passos = (['submeter', 'aprovar', 'publicar'] as const).filter((t) => {
      if (t === 'submeter') return card.status === 'DRAFT';
      if (t === 'aprovar') return card.status === 'DRAFT' || card.status === 'REVIEW_PENDING';
      return true;
    });
    for (const passo of passos) await transicionarCard(card.id, passo, ator);
    console.log(`  ✓ ${card.chave}`);
  }

  const depois = await recuperarConhecimento({ empresaId: (await prisma.empresa.findFirstOrThrow()).id, escolaId: escola.id, audience: 'SELLER' });
  const publicados = await prisma.knowledgeCard.count({ where: { chave: { in: CHAVES }, status: 'PUBLISHED' } });

  console.log(`\n  Retriever DEPOIS: ${depois.tipo}${depois.tipo === 'FOUND' ? ` → "${depois.card.titulo}"` : ''}`);
  console.log(`  Publicados: ${publicados}/${CHAVES.length}\n`);
}

main()
  .catch((err) => {
    console.error(`\n${err instanceof Error ? err.message : err}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
