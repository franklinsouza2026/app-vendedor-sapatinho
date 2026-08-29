import { describe, expect, it } from 'vitest';
import { criarPlaybookDraft, getPlaybookAtivo, getSecoesRelevantes, publicarPlaybook } from './playbook.service';
import { criarFixtureEmpresa } from '../gamificacao/test-helpers';
import { prisma } from '../db';

const SECAO_ABORDAGEM = { categoria: 'ABORDAGEM' as const, titulo: 'Recepção', conteudo: 'Receba com sorriso.', origem: 'OFICIAL' as const };
const SECAO_OBJECOES = { categoria: 'OBJECOES' as const, titulo: 'Objeção genérica', conteudo: 'Reconheça e investigue.', origem: 'DEMONSTRATIVO' as const };

describe('PlaybookService — versionamento', () => {
  it('cria em DRAFT e só fica ativo depois de publicar', async () => {
    const { empresa } = await criarFixtureEmpresa();
    const draft = await criarPlaybookDraft(empresa.id, 'Playbook Teste', [SECAO_ABORDAGEM]);

    expect(draft.status).toBe('DRAFT');
    expect(await getPlaybookAtivo(empresa.id)).toBeNull();

    await publicarPlaybook(draft.id, empresa.id, 'tester');
    const ativo = await getPlaybookAtivo(empresa.id);
    expect(ativo?.id).toBe(draft.id);
    expect(ativo?.status).toBe('PUBLISHED');
  });

  it('versão incrementa a cada novo draft da mesma empresa', async () => {
    const { empresa } = await criarFixtureEmpresa();
    const v1 = await criarPlaybookDraft(empresa.id, 'v1', [SECAO_ABORDAGEM]);
    const v2 = await criarPlaybookDraft(empresa.id, 'v2', [SECAO_ABORDAGEM]);

    expect(v1.versao).toBe(1);
    expect(v2.versao).toBe(2);
  });

  it('publicar uma nova versão arquiva a anterior, nunca deixando 2 PUBLISHED', async () => {
    const { empresa } = await criarFixtureEmpresa();
    const v1 = await criarPlaybookDraft(empresa.id, 'v1', [SECAO_ABORDAGEM]);
    await publicarPlaybook(v1.id, empresa.id, 'tester');

    const v2 = await criarPlaybookDraft(empresa.id, 'v2', [SECAO_ABORDAGEM]);
    await publicarPlaybook(v2.id, empresa.id, 'tester');

    const v1Recarregado = await prisma.playbook.findUniqueOrThrow({ where: { id: v1.id } });
    expect(v1Recarregado.status).toBe('ARCHIVED');

    const publicados = await prisma.playbook.count({ where: { empresaId: empresa.id, status: 'PUBLISHED' } });
    expect(publicados).toBe(1);
  });

  it('publicações concorrentes nunca deixam 2 playbooks PUBLISHED (mesma lição da Fatia 4)', async () => {
    const { empresa } = await criarFixtureEmpresa();
    const v1 = await criarPlaybookDraft(empresa.id, 'v1', [SECAO_ABORDAGEM]);
    await publicarPlaybook(v1.id, empresa.id, 'tester');
    const v2 = await criarPlaybookDraft(empresa.id, 'v2', [SECAO_ABORDAGEM]);

    await Promise.all(Array.from({ length: 5 }, () => publicarPlaybook(v2.id, empresa.id, 'tester')));

    const publicados = await prisma.playbook.count({ where: { empresaId: empresa.id, status: 'PUBLISHED' } });
    expect(publicados).toBe(1);
  });

  it('uma resposta já gerada preserva o playbook referenciado mesmo após uma nova publicação (seção 9)', async () => {
    const { empresa } = await criarFixtureEmpresa();
    const v1 = await criarPlaybookDraft(empresa.id, 'v1', [SECAO_ABORDAGEM]);
    await publicarPlaybook(v1.id, empresa.id, 'tester');

    // v1 arquivado por uma nova publicação depois...
    const v2 = await criarPlaybookDraft(empresa.id, 'v2', [SECAO_ABORDAGEM]);
    await publicarPlaybook(v2.id, empresa.id, 'tester');

    // ...mas o registro do v1 continua existindo e consultável por id — uma
    // TrainerMessage que referenciou v1.id continua resolvendo pro mesmo
    // conteúdo histórico, nunca reescrito.
    const v1AindaExiste = await prisma.playbook.findUnique({ where: { id: v1.id } });
    expect(v1AindaExiste).not.toBeNull();
    expect(v1AindaExiste?.nome).toBe('v1');
  });
});

describe('PlaybookService — isolamento de tenant', () => {
  it('empresa A nunca vê o playbook ativo da empresa B', async () => {
    const { empresa: empresaA } = await criarFixtureEmpresa();
    const { empresa: empresaB } = await criarFixtureEmpresa();

    const draftB = await criarPlaybookDraft(empresaB.id, 'Playbook B', [SECAO_ABORDAGEM]);
    await publicarPlaybook(draftB.id, empresaB.id, 'tester');

    expect(await getPlaybookAtivo(empresaA.id)).toBeNull();
  });

  it('publicarPlaybook rejeita publicar um playbook de outra empresa', async () => {
    const { empresa: empresaA } = await criarFixtureEmpresa();
    const { empresa: empresaB } = await criarFixtureEmpresa();
    const draftB = await criarPlaybookDraft(empresaB.id, 'Playbook B', [SECAO_ABORDAGEM]);

    await expect(publicarPlaybook(draftB.id, empresaA.id, 'tester')).rejects.toThrow();
  });
});

describe('getSecoesRelevantes', () => {
  it('retorna só as seções da categoria mapeada pro modo — nunca o playbook inteiro', async () => {
    const { empresa } = await criarFixtureEmpresa();
    const draft = await criarPlaybookDraft(empresa.id, 'Playbook Teste', [SECAO_ABORDAGEM, SECAO_OBJECOES]);
    await publicarPlaybook(draft.id, empresa.id, 'tester');

    const paraObjecao = await getSecoesRelevantes(empresa.id, 'OBJECAO');
    expect(paraObjecao.sections.map((s) => s.title)).toEqual(['Objeção genérica']);

    const paraAbordagem = await getSecoesRelevantes(empresa.id, 'ABORDAGEM');
    expect(paraAbordagem.sections.map((s) => s.title)).toEqual(['Recepção']);
  });

  it('sem playbook publicado, retorna versão null e nenhuma seção (nunca quebra)', async () => {
    const { empresa } = await criarFixtureEmpresa();
    const resultado = await getSecoesRelevantes(empresa.id, 'FECHAMENTO');
    expect(resultado.version).toBeNull();
    expect(resultado.sections).toEqual([]);
  });
});
