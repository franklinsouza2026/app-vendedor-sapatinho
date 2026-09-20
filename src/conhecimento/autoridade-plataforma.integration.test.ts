// Autoridade de plataforma (Etapa 2C.3B).
//
// A REGRA: conhecimento GLOBAL pertence à PLATAFORMA; conteúdo de empresa
// pertence à EMPRESA. E **leitura não é autoridade** — qualquer empresa usa o
// conhecimento global sem ter o direito de reescrevê-lo.
//
// Hoje a instalação tem uma empresa só, e é justamente por isso que a distinção
// precisa existir agora: quando houver dezenas, um ADMIN de uma delas
// reescrevendo conhecimento global seria um problema sério — e a hora de fechar
// é antes, não depois.
import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Papel } from '@prisma/client';
import { prisma } from '../db';
import { criarFixtureEmpresa } from '../gamificacao/test-helpers';
import { AtorAdministrativo, atualizarCard, criarCard, transicionarCard } from './knowledge-card.service';
import { recuperarConhecimento } from './knowledge-retriever.service';
import { PILOTO_HABITOS } from './piloto-habitos';

type Fixture = Awaited<ReturnType<typeof criarFixtureEmpresa>>;

const comoPapel = (f: Fixture, papel: Papel): AtorAdministrativo => ({ vendedorId: f.vendedor.id, empresaId: f.empresa.id, papel });

async function escola() {
  return prisma.escolaUniversidade.create({
    data: { code: `escola-${randomUUID()}`, name: 'Escola de Teste', description: 'fixture', audience: 'BOTH' },
  });
}

function cardValido(escolaId: string, over: Record<string, unknown> = {}) {
  return {
    chave: `c-${randomUUID().slice(0, 8)}`,
    escolaId,
    titulo: 'Título fictício',
    principio: 'Princípio fictício de teste.',
    quandoUsar: 'Quando o teste pedir.',
    quandoNaoUsar: 'Nunca em produção.',
    tipoFonte: 'DESENVOLVIMENTO_PESSOAL' as const,
    ...over,
  };
}

describe('RBAC GLOBAL — só a plataforma governa', () => {
  it('PLATFORM_ADMIN percorre o ciclo inteiro de um card global', async () => {
    const f = await criarFixtureEmpresa();
    const e = await escola();
    const plataforma = comoPapel(f, 'PLATFORM_ADMIN');

    const card = await criarCard(cardValido(e.id, { empresaId: null }), plataforma);
    expect(card.empresaId).toBeNull();

    await atualizarCard(card.id, { titulo: 'Título revisado' }, plataforma);
    expect((await transicionarCard(card.id, 'submeter', plataforma)).status).toBe('REVIEW_PENDING');
    expect((await transicionarCard(card.id, 'aprovar', plataforma)).status).toBe('APPROVED');

    const publicado = await transicionarCard(card.id, 'publicar', plataforma);
    expect(publicado.status).toBe('PUBLISHED');
    expect(publicado.approvedBy).toBe(f.vendedor.id);
    expect(publicado.publishedAt).not.toBeNull();

    expect((await transicionarCard(card.id, 'arquivar', plataforma)).status).toBe('ARCHIVED');
  });

  it.each<[Papel]>([['ADMIN'], ['GERENTE'], ['VENDEDOR']])('%s não governa card global em NENHUMA operação', async (papel) => {
    const f = await criarFixtureEmpresa();
    const e = await escola();
    const semPoder = comoPapel(f, papel);

    // Semeado direto pra isolar a autoridade de escrita das etapas anteriores.
    const global = await prisma.knowledgeCard.create({ data: { ...cardValido(e.id), empresaId: null, tags: [] } });

    await expect(criarCard(cardValido(e.id, { empresaId: null }), semPoder)).rejects.toMatchObject({ status: 403 });
    await expect(atualizarCard(global.id, { titulo: 'invadido' }, semPoder)).rejects.toMatchObject({ status: 403 });
    for (const t of ['submeter', 'aprovar', 'publicar', 'arquivar'] as const) {
      await expect(transicionarCard(global.id, t, semPoder)).rejects.toMatchObject({ status: 403 });
    }

    expect((await prisma.knowledgeCard.findUniqueOrThrow({ where: { id: global.id } })).status).toBe('DRAFT');
  });
});

describe('RBAC EMPRESA — e menor privilégio nos dois sentidos', () => {
  it('ADMIN governa o conhecimento da própria empresa, e só dela', async () => {
    const a = await criarFixtureEmpresa();
    const b = await criarFixtureEmpresa();
    const e = await escola();

    const card = await criarCard(cardValido(e.id), comoPapel(a, 'ADMIN'));
    expect(card.empresaId).toBe(a.empresa.id);

    await expect(atualizarCard(card.id, { titulo: 'x' }, comoPapel(b, 'ADMIN'))).rejects.toMatchObject({ status: 404 });
    await expect(transicionarCard(card.id, 'submeter', comoPapel(b, 'ADMIN'))).rejects.toMatchObject({ status: 404 });
  });

  it('PLATFORM_ADMIN NÃO herda o conteúdo das empresas', async () => {
    const f = await criarFixtureEmpresa();
    const e = await escola();
    const daEmpresa = await criarCard(cardValido(e.id), comoPapel(f, 'ADMIN'));

    // A plataforma cuida do global; a empresa cuida do dela. Dar os dois ao
    // mesmo papel criaria um superadmin sem necessidade nenhuma.
    await expect(criarCard(cardValido(e.id), comoPapel(f, 'PLATFORM_ADMIN'))).rejects.toMatchObject({ status: 403 });
    await expect(atualizarCard(daEmpresa.id, { titulo: 'x' }, comoPapel(f, 'PLATFORM_ADMIN'))).rejects.toMatchObject({ status: 403 });
    await expect(transicionarCard(daEmpresa.id, 'submeter', comoPapel(f, 'PLATFORM_ADMIN'))).rejects.toMatchObject({ status: 403 });
  });

  it.each<[Papel]>([['GERENTE'], ['VENDEDOR']])('%s não governa conteúdo de empresa', async (papel) => {
    const f = await criarFixtureEmpresa();
    const e = await escola();
    await expect(criarCard(cardValido(e.id), comoPapel(f, papel))).rejects.toMatchObject({ status: 403 });
  });
});

describe('LEITURA NÃO É AUTORIDADE', () => {
  it('as duas empresas LEEM o card global publicado; nenhuma pode reescrevê-lo', async () => {
    const a = await criarFixtureEmpresa();
    const b = await criarFixtureEmpresa();
    const e = await escola();

    const card = await criarCard(cardValido(e.id, { empresaId: null }), comoPapel(a, 'PLATFORM_ADMIN'));
    await transicionarCard(card.id, 'submeter', comoPapel(a, 'PLATFORM_ADMIN'));
    await transicionarCard(card.id, 'aprovar', comoPapel(a, 'PLATFORM_ADMIN'));
    await transicionarCard(card.id, 'publicar', comoPapel(a, 'PLATFORM_ADMIN'));

    for (const empresa of [a, b]) {
      const r = await recuperarConhecimento({ empresaId: empresa.empresa.id, escolaId: e.id, audience: 'SELLER' });
      expect(r.tipo === 'FOUND' && r.card.id).toBe(card.id);
      expect(r.tipo === 'FOUND' && r.card.escopo).toBe('GLOBAL');
    }

    // Usar não dá direito de reescrever — é o ponto inteiro da fatia.
    await expect(atualizarCard(card.id, { titulo: 'x' }, comoPapel(a, 'ADMIN'))).rejects.toMatchObject({ status: 403 });
    await expect(atualizarCard(card.id, { titulo: 'x' }, comoPapel(b, 'ADMIN'))).rejects.toMatchObject({ status: 403 });
  });
});

describe('CICLO REAL — DRAFT devolve NO_KNOWLEDGE, PUBLISHED devolve FOUND', () => {
  it('a passagem acontece pelas transições de verdade, nunca por UPDATE no banco', async () => {
    const f = await criarFixtureEmpresa();
    const e = await escola();
    const plataforma = comoPapel(f, 'PLATFORM_ADMIN');
    const pedido = { empresaId: f.empresa.id, escolaId: e.id, audience: 'SELLER' as const };

    const card = await criarCard(cardValido(e.id, { empresaId: null }), plataforma);
    expect((await recuperarConhecimento(pedido)).tipo).toBe('NO_KNOWLEDGE');

    await transicionarCard(card.id, 'submeter', plataforma);
    expect((await recuperarConhecimento(pedido)).tipo, 'REVIEW_PENDING não pode ser recuperável').toBe('NO_KNOWLEDGE');

    await transicionarCard(card.id, 'aprovar', plataforma);
    // Aprovar não é publicar: o conteúdo só entra na experiência no último passo.
    expect((await recuperarConhecimento(pedido)).tipo, 'APPROVED não pode ser recuperável').toBe('NO_KNOWLEDGE');

    await transicionarCard(card.id, 'publicar', plataforma);
    const depois = await recuperarConhecimento(pedido);
    expect(depois.tipo).toBe('FOUND');
    expect(depois.tipo === 'FOUND' && depois.card.id).toBe(card.id);

    await transicionarCard(card.id, 'arquivar', plataforma);
    expect((await recuperarConhecimento(pedido)).tipo).toBe('NO_KNOWLEDGE');
  });

  it('mesmo com os seis cards publicados, a recuperação devolve UM', async () => {
    const f = await criarFixtureEmpresa();
    const e = await escola();
    const plataforma = comoPapel(f, 'PLATFORM_ADMIN');

    for (const card of PILOTO_HABITOS) {
      const criado = await criarCard(
        {
          ...cardValido(e.id, { empresaId: null }),
          chave: `${card.chave}-${randomUUID().slice(0, 6)}`,
          titulo: card.titulo,
          principio: card.principio,
          quandoUsar: card.quandoUsar,
          quandoNaoUsar: card.quandoNaoUsar,
          exemplo: card.exemplo,
          tipoFonte: card.tipoFonte,
          fonte: card.fonte,
          autor: card.autor,
          referencia: card.referencia,
          notaProvenance: card.notaProvenance,
          audience: 'BOTH',
          tags: card.tags,
        },
        plataforma
      );
      await transicionarCard(criado.id, 'submeter', plataforma);
      await transicionarCard(criado.id, 'aprovar', plataforma);
      await transicionarCard(criado.id, 'publicar', plataforma);
    }

    // O contrato da 2C.2 não muda por haver mais conteúdo: 1 card ou nada.
    const r = await recuperarConhecimento({ empresaId: f.empresa.id, escolaId: e.id, audience: 'SELLER' });
    expect(r.tipo).toBe('FOUND');
    expect(Array.isArray(r.tipo === 'FOUND' ? r.card : null)).toBe(false);
  });

  it('filtro de tipo continua estrito com os seis publicados', async () => {
    const f = await criarFixtureEmpresa();
    const e = await escola();
    const plataforma = comoPapel(f, 'PLATFORM_ADMIN');

    for (const tipo of ['CIENTIFICO', 'METODOLOGIA', 'DESENVOLVIMENTO_PESSOAL'] as const) {
      const c = await criarCard(
        cardValido(e.id, { empresaId: null, tipoFonte: tipo, fonte: 'Fonte fictícia (2020)', autor: 'Autor Fictício' }),
        plataforma
      );
      await transicionarCard(c.id, 'submeter', plataforma);
      await transicionarCard(c.id, 'aprovar', plataforma);
      await transicionarCard(c.id, 'publicar', plataforma);
    }

    for (const tipo of ['CIENTIFICO', 'METODOLOGIA', 'DESENVOLVIMENTO_PESSOAL'] as const) {
      const r = await recuperarConhecimento({ empresaId: f.empresa.id, escolaId: e.id, tipoFonte: [tipo] });
      expect(r.tipo === 'FOUND' && r.card.tipoFonte).toBe(tipo);
    }
  });
});

describe('ESCALAÇÃO DE PRIVILÉGIO — fechada, e travada por teste', () => {
  it('a rota que define papel NÃO aceita PLATFORM_ADMIN', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const rota = readFileSync(join(__dirname, '../routes/admin.ts'), 'utf8');

    // Lista literal de propósito. Trocar por `z.nativeEnum(Papel)` pareceria
    // uma limpeza e abriria escalação: o ADMIN passaria a criar autoridade de
    // plataforma pela própria API. É por isso que isto é teste, não comentário.
    expect(rota).toMatch(/papel:\s*z\.enum\(\['VENDEDOR', 'GERENTE', 'ADMIN'\]\)/);
    expect(rota).not.toMatch(/papel:\s*z\.nativeEnum\(Papel\)\.default/);
  });

  it('nenhuma rota HTTP altera o papel de um usuário existente', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    const dir = join(__dirname, '../routes');

    // Promover é operação de servidor (script), nunca permissão de aplicação —
    // senão o ADMIN se promove sozinho e a separação vira decoração.
    for (const arquivo of readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.includes('.test.'))) {
      const conteudo = readFileSync(join(dir, arquivo), 'utf8');
      expect(conteudo, `${arquivo} parece alterar papel`).not.toMatch(/data:\s*\{[^}]*\bpapel\b/);
    }
  });

  it('PLATFORM_ADMIN não vira caminho para dados de outra empresa', async () => {
    const a = await criarFixtureEmpresa();
    const b = await criarFixtureEmpresa();
    const e = await escola();
    const cardDeB = await criarCard(cardValido(e.id), comoPapel(b, 'ADMIN'));

    // O papel amplia autoridade sobre o GLOBAL, não sobre tenants.
    await expect(atualizarCard(cardDeB.id, { titulo: 'x' }, comoPapel(a, 'PLATFORM_ADMIN'))).rejects.toMatchObject({ status: 404 });
  });

  it('payload não forja status, aprovador, versão nem escopo', async () => {
    const f = await criarFixtureEmpresa();
    const e = await escola();
    const plataforma = comoPapel(f, 'PLATFORM_ADMIN');
    const card = await criarCard(cardValido(e.id, { empresaId: null }), plataforma);

    const forjado = { titulo: 'legítimo', status: 'PUBLISHED', approvedBy: 'forjado', version: 99, empresaId: f.empresa.id, papel: 'PLATFORM_ADMIN' } as never;
    await atualizarCard(card.id, forjado, plataforma);

    const depois = await prisma.knowledgeCard.findUniqueOrThrow({ where: { id: card.id } });
    expect(depois.titulo).toBe('legítimo');
    expect(depois.status).toBe('DRAFT');
    expect(depois.approvedBy).toBeNull();
    expect(depois.version).toBe(1);
    expect(depois.empresaId).toBeNull();
  });
});

describe('PRIVACIDADE — o papel novo não abre a esfera do Conselheiro', () => {
  it('nenhuma rota concede a PLATFORM_ADMIN acesso a conversa, check-in ou memória', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    const dir = join(__dirname, '../routes');

    // Os guards do projeto são allowlists positivas, então um papel novo nasce
    // sem nada. O que este teste impede é alguém acrescentá-lo a uma rota que
    // toque a esfera privada — a privacidade da 2B não se negocia.
    for (const arquivo of readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.includes('.test.'))) {
      const conteudo = readFileSync(join(dir, arquivo), 'utf8');
      if (!/PLATFORM_ADMIN/.test(conteudo)) continue;
      for (const privado of [/coachMessage/, /coachConversation/, /coachCheckIn/, /coachIntervention/, /professionalMemory/]) {
        expect(conteudo, `${arquivo} daria a PLATFORM_ADMIN acesso a ${privado}`).not.toMatch(privado);
      }
    }
  });

  it('o papel não aparece em nenhuma rota do Conselheiro', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    expect(readFileSync(join(__dirname, '../routes/coach.ts'), 'utf8')).not.toMatch(/PLATFORM_ADMIN/);
  });

  it('não entra em ranking nem em meta comercial', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    // Ambos usam allowlist positiva de VENDEDOR — a exclusão é estrutural, e
    // este teste existe pra que continue sendo.
    expect(readFileSync(join(__dirname, '../gamificacao/ranking.service.ts'), 'utf8')).toMatch(/papel:\s*'VENDEDOR'/);
    expect(readFileSync(join(__dirname, '../services/metas-admin.service.ts'), 'utf8')).toMatch(/papel !== 'VENDEDOR'/);
  });
});

describe('TEXTO HOMOLOGADO — os ajustes dos Cards 1 e 4 não regridem', () => {
  it('Card 1 fala em POSSIBILIDADE, não em diagnóstico de causa', () => {
    const card = PILOTO_HABITOS.find((c) => c.chave === 'habito-comecar-pequeno')!;
    expect(card.principio).toMatch(/uma possibilidade é que/i);
    // A formulação anterior transformava abandono em diagnóstico de "ação
    // grande demais" — causalidade que a evidência não sustenta.
    expect(card.principio).not.toMatch(/muitas vezes o problema não é/i);
    expect(card.principio).toMatch(/pode tornar a repetição mais possível/i);
  });

  it('Card 4 descreve tendência, não mecanismo universal', () => {
    const card = PILOTO_HABITOS.find((c) => c.chave === 'habito-consistencia-antes-de-intensidade')!;
    expect(card.principio).toMatch(/ajuda essa ação a se tornar mais automática/i);
    expect(card.principio).not.toMatch(/o que firma uma rotina é/i);
    expect(card.principio).toMatch(/pode fazer sentido/i);
  });

  it('os outros quatro seguem com a classificação homologada', () => {
    const esperado: Record<string, string> = {
      'habito-comecar-pequeno': 'METODOLOGIA',
      'habito-ambiente-facilita': 'CIENTIFICO',
      'habito-gatilho-claro': 'CIENTIFICO',
      'habito-consistencia-antes-de-intensidade': 'CIENTIFICO',
      'habito-retomar-sem-abandonar': 'CIENTIFICO',
      // Continua NÃO sendo ciência: a revisão consultada não sustenta que
      // "uma de cada vez" seja superior. Promover isso a CIENTIFICO seria
      // exatamente o que o eixo existe pra impedir.
      'habito-uma-mudanca-por-vez': 'DESENVOLVIMENTO_PESSOAL',
    };
    for (const card of PILOTO_HABITOS) expect(card.tipoFonte, card.chave).toBe(esperado[card.chave]);
  });
});

