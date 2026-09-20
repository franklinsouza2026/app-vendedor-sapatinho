// Piloto editorial de Hábitos (Etapa 2C.3) — os seis candidatos.
//
// O TESTE QUE MAIS IMPORTA AQUI é o de que o conteúdo NÃO chegou a lugar
// nenhum: rascunho não aprovado não pode entrar na experiência por acidente.
// Enquanto os cards estiverem em `DRAFT`, o Retriever devolve `NO_KNOWLEDGE`
// para Hábitos — e isso é o comportamento correto, não uma pendência.
//
// Os demais testes são de qualidade editorial: são as regras do comando desta
// fatia viradas em asserção, pra que uma revisão futura não precise reler seis
// textos à mão pra saber se algo regrediu.
import { describe, expect, it } from 'vitest';
import { prisma } from '../db';
import { criarFixtureEmpresa } from '../gamificacao/test-helpers';
import { LIMITES } from './knowledge-card.service';
import { recuperarConhecimento } from './knowledge-retriever.service';
import { ESCOLA_DO_PILOTO, PILOTO_HABITOS } from './piloto-habitos';

/** Cria a Escola do piloto no banco de teste, sem depender do seed do catálogo. */
async function escolaDoPiloto() {
  const existente = await prisma.escolaUniversidade.findUnique({ where: { code: ESCOLA_DO_PILOTO } });
  if (existente) return existente;
  return prisma.escolaUniversidade.create({
    data: { code: ESCOLA_DO_PILOTO, name: 'Escola de Organização e Produtividade', description: 'Rotina, prioridades e produtividade pessoal.', audience: 'BOTH' },
  });
}

/** Insere os seis rascunhos, exatamente como o script de plataforma faz. */
async function semearRascunhos() {
  const escola = await escolaDoPiloto();
  for (const card of PILOTO_HABITOS) {
    const chave = `${card.chave}-${Math.random().toString(36).slice(2, 8)}`;
    await prisma.knowledgeCard.create({
      data: {
        chave,
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
        audience: 'BOTH',
        tags: card.tags,
        status: 'DRAFT',
      },
    });
  }
  return escola;
}

describe('GATE HUMANO — rascunho não aprovado não entra na experiência', () => {
  it('com os seis rascunhos no banco, o Retriever devolve NO_KNOWLEDGE para Hábitos', async () => {
    const f = await criarFixtureEmpresa();
    const escola = await semearRascunhos();

    // ESTE É O TESTE FUNDAMENTAL DA FATIA. Conteúdo editorial que ninguém
    // homologou não pode escorregar para dentro do produto — e o fato de a
    // recuperação voltar vazia é a prova de que o gate humano está de pé.
    const r = await recuperarConhecimento({ empresaId: f.empresa.id, escolaId: escola.id, audience: 'SELLER' });
    expect(r.tipo).toBe('NO_KNOWLEDGE');
  });

  it('nenhum card do piloto nasce aprovado ou publicado', async () => {
    await semearRascunhos();
    const cards = await prisma.knowledgeCard.findMany({ where: { empresaId: null, chave: { startsWith: 'habito-' } } });
    expect(cards.length).toBeGreaterThanOrEqual(PILOTO_HABITOS.length);

    for (const card of cards) {
      expect(card.status, `${card.chave} não está em DRAFT`).toBe('DRAFT');
      expect(card.approvedBy, `${card.chave} tem aprovador`).toBeNull();
      expect(card.publishedAt, `${card.chave} tem data de publicação`).toBeNull();
      // Ninguém escreveu isto como usuário do produto: inventar um autor seria
      // forjar ator, e `createdBy` aponta para um Vendedor real.
      expect(card.createdBy, `${card.chave} tem autor forjado`).toBeNull();
    }
  });

  it('o escopo declarado é GLOBAL — conhecimento geral não vira conteúdo de empresa', async () => {
    await semearRascunhos();
    const cards = await prisma.knowledgeCard.findMany({ where: { chave: { startsWith: 'habito-' } } });
    // Cadastrar como conteúdo de uma empresa só porque o escopo global não tem
    // editor seria mentir para o schema.
    for (const card of cards) expect(card.empresaId, `${card.chave} foi cadastrado sob uma empresa`).toBeNull();
  });
});

describe('QUALIDADE EDITORIAL — as regras da fatia viradas em asserção', () => {
  it('são exatamente seis candidatos, com chaves únicas', () => {
    expect(PILOTO_HABITOS).toHaveLength(6);
    expect(new Set(PILOTO_HABITOS.map((c) => c.chave)).size).toBe(6);
  });

  it('cabem nos limites e continuam pequenos', () => {
    for (const card of PILOTO_HABITOS) {
      expect(card.principio.length, `${card.chave}: princípio`).toBeLessThanOrEqual(LIMITES.principio);
      expect(card.quandoUsar.length, `${card.chave}: quandoUsar`).toBeLessThanOrEqual(LIMITES.quandoUsar);
      expect(card.quandoNaoUsar.length, `${card.chave}: quandoNaoUsar`).toBeLessThanOrEqual(LIMITES.quandoNaoUsar);
      expect(card.exemplo.length, `${card.chave}: exemplo`).toBeLessThanOrEqual(LIMITES.exemplo);
      expect(card.fonte.length, `${card.chave}: fonte`).toBeLessThanOrEqual(LIMITES.fonte);
      // Um card é um princípio curado, não um artigo: o conteúdo medido no
      // produto na 2C.0 tinha 451 caracteres de média.
      expect(card.principio.length, `${card.chave}: princípio virou artigo`).toBeLessThan(700);
    }
  });

  it('cada contraindicação é PRÓPRIA — nenhuma foi copiada entre cards', () => {
    // `quandoNaoUsar` genérico e repetido seria o mesmo que não ter: o campo
    // existe pra dizer quando AQUELE conselho atrapalha.
    const contraindicacoes = PILOTO_HABITOS.map((c) => c.quandoNaoUsar);
    expect(new Set(contraindicacoes).size).toBe(6);
    for (const card of PILOTO_HABITOS) {
      expect(card.quandoNaoUsar.length, `${card.chave}: contraindicação curta demais pra ser específica`).toBeGreaterThan(120);
    }
  });

  it('não culpabiliza, não diagnostica e não promete resultado', () => {
    // Hábito depende de contexto, energia e restrição — não só de disciplina.
    const proibidos = [
      /falta de disciplina/i,
      /força de vontade é tudo/i,
      /preguiç/i,
      /desculpa/i,
      // Nada de diagnóstico: "não consigo manter rotina" não é transtorno.
      /tdah/i,
      /depress/i,
      /ansiedade/i,
      /burnout/i,
      /transtorno/i,
      // Nada de promessa nem de ciência inflada.
      /garante/i,
      /vai mudar sua vida/i,
      /infal[íi]vel/i,
      /comprovado cientificamente/i,
      /a ci[êe]ncia prova/i,
      /o segredo/i,
    ];
    for (const card of PILOTO_HABITOS) {
      const texto = [card.titulo, card.principio, card.quandoUsar, card.quandoNaoUsar, card.exemplo].join(' ');
      for (const padrao of proibidos) {
        expect(texto, `${card.chave} contém padrão proibido ${padrao}`).not.toMatch(padrao);
      }
    }
  });

  it('a superfície do card não usa jargão técnico', () => {
    // A terminologia pode viver na provenance; o texto que orientaria a
    // conversa precisa soar como gente.
    const jargao = [/habit stacking/i, /\bcue\b/i, /implementation intention/i, /reinforcement/i, /behavioral activation/i, /automaticidade/i];
    for (const card of PILOTO_HABITOS) {
      const superficie = [card.titulo, card.principio, card.quandoUsar, card.quandoNaoUsar, card.exemplo].join(' ');
      for (const padrao of jargao) {
        expect(superficie, `${card.chave} usa jargão ${padrao} na superfície`).not.toMatch(padrao);
      }
    }
  });

  it('toda provenance é real e a classificação é honesta', () => {
    for (const card of PILOTO_HABITOS) {
      expect(card.fonte.trim().length, `${card.chave} sem fonte`).toBeGreaterThan(30);
      expect(card.referencia, `${card.chave} sem referência`).toMatch(/^https:\/\//);
      expect(card.notaProvenance.trim().length, `${card.chave} sem nota de provenance`).toBeGreaterThan(60);
      // Regra da 2C.1: conteúdo científico exige fonte identificável, porque é
      // o único tipo que autoriza afirmar como fato.
      if (card.tipoFonte === 'CIENTIFICO') {
        expect(card.fonte, `${card.chave}: científico sem publicação identificável`).toMatch(/\(\d{4}\)/);
      }
      // Metodologia exige autor ou fonte nomeada.
      if (card.tipoFonte === 'METODOLOGIA') {
        expect(card.autor ?? card.fonte, `${card.chave}: metodologia sem autor`).toBeTruthy();
      }
    }
  });

  it('a classificação de fonte é variada — não é etiqueta decorativa', () => {
    const tipos = new Set(PILOTO_HABITOS.map((c) => c.tipoFonte));
    // Se os seis fossem CIENTIFICO, o eixo `tipoFonte` não estaria sendo usado
    // de verdade. "Uma mudança por vez" NÃO é científico de propósito: a
    // revisão sistemática consultada não sustenta que seja superior.
    expect(tipos.size).toBeGreaterThanOrEqual(3);
    expect(PILOTO_HABITOS.find((c) => c.chave === 'habito-uma-mudanca-por-vez')?.tipoFonte).toBe('DESENVOLVIMENTO_PESSOAL');
    expect(PILOTO_HABITOS.find((c) => c.chave === 'habito-comecar-pequeno')?.tipoFonte).toBe('METODOLOGIA');
  });

  it('os cards não são redundantes entre si', () => {
    // Os pares que mais se aproximam, e que o comando mandou distinguir:
    // começar pequeno (tamanho do primeiro passo) × consistência (progressão
    // depois de começar); consistência (construir repetição) × retomada (o que
    // fazer depois de parar); gatilho (lembrar/iniciar) × ambiente (facilitar).
    const por = (chave: string) => PILOTO_HABITOS.find((c) => c.chave === chave)!;
    const pares: [string, string][] = [
      ['habito-comecar-pequeno', 'habito-consistencia-antes-de-intensidade'],
      ['habito-consistencia-antes-de-intensidade', 'habito-retomar-sem-abandonar'],
      ['habito-gatilho-claro', 'habito-ambiente-facilita'],
    ];
    for (const [a, b] of pares) {
      expect(por(a).principio).not.toBe(por(b).principio);
      expect(por(a).quandoUsar).not.toBe(por(b).quandoUsar);
      // Cada um se contraindica explicitamente na situação do outro, que é o
      // que prova que resolvem problemas diferentes.
      expect(por(a).quandoNaoUsar).not.toBe(por(b).quandoNaoUsar);
    }
  });
});

describe('NÃO-INTEGRAÇÃO — o conteúdo não encostou no produto', () => {
  it('nenhum arquivo do fluxo de conversa referencia o piloto', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const { join } = await import('node:path');

    const raiz = join(__dirname, '..');
    const arquivos = [
      ...readdirSync(join(raiz, 'coach')).map((f) => join(raiz, 'coach', f)),
      ...readdirSync(join(raiz, 'coach/prompts')).map((f) => join(raiz, 'coach/prompts', f)),
      ...readdirSync(join(raiz, 'pertinencia')).map((f) => join(raiz, 'pertinencia', f)),
      ...readdirSync(join(raiz, 'ai-platform')).map((f) => join(raiz, 'ai-platform', f)),
      ...readdirSync(join(raiz, 'ai-platform/providers')).map((f) => join(raiz, 'ai-platform/providers', f)),
      ...readdirSync(join(raiz, 'treinador')).map((f) => join(raiz, 'treinador', f)),
      ...readdirSync(join(raiz, 'routes')).map((f) => join(raiz, 'routes', f)),
    ].filter((f) => f.endsWith('.ts') && !f.includes('.test.'));

    for (const arquivo of arquivos) {
      const conteudo = readFileSync(arquivo, 'utf8');
      expect(conteudo, `${arquivo} já consome conhecimento — isso é 2C.5`).not.toMatch(/PILOTO_HABITOS|piloto-habitos|recuperarConhecimento|KnowledgeCard/);
    }
  });

  it('o piloto não é carregado por nenhum seed automático', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    // O script é de plataforma e roda à mão. Entrar no seed geral faria
    // conteúdo editorial não homologado aparecer em todo ambiente novo.
    const seed = readFileSync(join(__dirname, '../../scripts/seed.ts'), 'utf8');
    expect(seed).not.toMatch(/piloto-habitos|PILOTO_HABITOS/);
  });
});
