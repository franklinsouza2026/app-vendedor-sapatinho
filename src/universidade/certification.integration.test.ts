// Certification (Fatia 7.5E, seção 45-50) — backend é a única autoridade de
// emissão; idempotência sob concorrência real; guard dos 13 Mandamentos
// nunca permite certificar sem conteúdo oficial completo.
import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../db';
import { criarFixtureEmpresa } from '../gamificacao/test-helpers';
import {
  criarCertificationDefinition,
  definirRequisitos,
  transicionarCertificationDefinition,
  avaliarElegibilidade,
  emitirCertificacaoSeElegivel,
} from './certification.service';
import { UniversidadeError } from './constantes';

// MandamentoOficial é uma tabela GLOBAL fixa (13 linhas), compartilhada com
// outros arquivos de teste (Fatia 7.5C) — garante estado limpo (sem
// conteúdo) antes de testar o guard de certificação, independente da ordem
// de execução dos arquivos.
async function garantirMandamentosIncompletos() {
  for (let numero = 1; numero <= 13; numero++) {
    await prisma.mandamentoOficial.upsert({
      where: { numero },
      update: { conteudoOficial: null, status: 'DRAFT' },
      create: { numero, titulo: `Mandamento ${numero}`, status: 'DRAFT' },
    });
  }
}

async function publicarCertificacaoSemRequisitos(actorId: string) {
  const def = await criarCertificationDefinition({ code: `cert-${randomUUID()}`, name: 'Certificação Teste', description: 'd' }, actorId);
  await definirRequisitos(def.id, [], actorId);
  await transicionarCertificationDefinition(def.id, 'submeter', actorId);
  await transicionarCertificationDefinition(def.id, 'aprovar', actorId);
  return transicionarCertificationDefinition(def.id, 'publicar', actorId);
}

describe('Certification — elegibilidade e emissão', () => {
  it('sem requisitos configurados, todo mundo é elegível (lista vazia = nada a cumprir)', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const def = await publicarCertificacaoSemRequisitos(vendedor.id);

    const elegibilidade = await avaliarElegibilidade(vendedor.id, def.id);
    expect(elegibilidade.elegivel).toBe(true);
  });

  it('certificação DRAFT (nunca publicada) nunca é elegível, mesmo sem requisitos', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const def = await criarCertificationDefinition({ code: `cert-draft-${randomUUID()}`, name: 'X', description: 'd' }, vendedor.id);

    const elegibilidade = await avaliarElegibilidade(vendedor.id, def.id);
    expect(elegibilidade.elegivel).toBe(false);
  });

  it('requisito QUIZ_MIN_SCORE bloqueia até o score real bater — nunca aceita eligible=true do cliente', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const trilha = await prisma.academyTrack.create({ data: { code: `trilha-cert-${randomUUID()}`, title: 'T', description: 'd', status: 'PUBLISHED' } });
    const aula = await prisma.academyLesson.create({ data: { trackId: trilha.id, code: `aula-cert-${randomUUID()}`, title: 'A', description: 'd', content: 'c', estimatedMinutes: 5, status: 'PUBLISHED' } });

    const def = await criarCertificationDefinition({ code: `cert-quiz-${randomUUID()}`, name: 'X', description: 'd' }, vendedor.id);
    await definirRequisitos(def.id, [{ tipo: 'QUIZ_MIN_SCORE', refId: aula.id, minScore: 80 }], vendedor.id);
    await transicionarCertificationDefinition(def.id, 'submeter', vendedor.id);
    await transicionarCertificationDefinition(def.id, 'aprovar', vendedor.id);
    const publicada = await transicionarCertificationDefinition(def.id, 'publicar', vendedor.id);

    const antesDoQuiz = await avaliarElegibilidade(vendedor.id, publicada.id);
    expect(antesDoQuiz.elegivel).toBe(false);

    await prisma.academyProgress.create({
      data: { empresaId: vendedor.empresaId, lojaId: vendedor.lojaId, vendedorId: vendedor.id, lessonId: aula.id, status: 'COMPLETED', quizScore: 60, quizPassed: false },
    });
    const scoreBaixo = await avaliarElegibilidade(vendedor.id, publicada.id);
    expect(scoreBaixo.elegivel).toBe(false); // 60 < 80

    await prisma.academyProgress.update({ where: { vendedorId_lessonId: { vendedorId: vendedor.id, lessonId: aula.id } }, data: { quizScore: 90, quizPassed: true } });
    const scoreAlto = await avaliarElegibilidade(vendedor.id, publicada.id);
    expect(scoreAlto.elegivel).toBe(true);
  });

  it('emitir sem elegibilidade lança requisitos_nao_atendidos — nunca emite', async () => {
    await garantirMandamentosIncompletos();
    const { vendedor } = await criarFixtureEmpresa();
    const def = await criarCertificationDefinition({ code: `cert-neg-${randomUUID()}`, name: 'X', description: 'd' }, vendedor.id);
    await definirRequisitos(def.id, [{ tipo: 'MANDAMENTOS_COMPLETOS' }], vendedor.id);
    await transicionarCertificationDefinition(def.id, 'submeter', vendedor.id);
    await transicionarCertificationDefinition(def.id, 'aprovar', vendedor.id);
    const publicada = await transicionarCertificationDefinition(def.id, 'publicar', vendedor.id);

    // 13 Mandamentos sempre existem estruturalmente, mas nunca com conteúdo
    // oficial completo neste teste — certificação nunca pode ser emitida.
    await expect(emitirCertificacaoSeElegivel(vendedor.id, publicada.id)).rejects.toThrow(UniversidadeError);
    const count = await prisma.userCertification.count({ where: { userId: vendedor.id, definitionId: publicada.id } });
    expect(count).toBe(0);
  });

  it('emissão idempotente: 2 chamadas concorrentes nunca duplicam (constraint única)', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const def = await publicarCertificacaoSemRequisitos(vendedor.id);

    const [c1, c2] = await Promise.all([emitirCertificacaoSeElegivel(vendedor.id, def.id), emitirCertificacaoSeElegivel(vendedor.id, def.id)]);
    expect(c1.id).toBe(c2.id);

    const count = await prisma.userCertification.count({ where: { userId: vendedor.id, definitionId: def.id } });
    expect(count).toBe(1);
  });

  it('recertificação: editar requisitos de uma certificação PUBLISHED bump a versão — histórico da emissão antiga nunca é apagado', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const def = await publicarCertificacaoSemRequisitos(vendedor.id);
    const emissao1 = await emitirCertificacaoSeElegivel(vendedor.id, def.id);
    expect(emissao1.definitionVersion).toBe(1);

    const atualizada = await definirRequisitos(def.id, [], vendedor.id);
    expect(atualizada.version).toBe(2);

    const emissao2 = await emitirCertificacaoSeElegivel(vendedor.id, def.id);
    expect(emissao2.definitionVersion).toBe(2);
    expect(emissao2.id).not.toBe(emissao1.id);

    const historico = await prisma.userCertification.findMany({ where: { userId: vendedor.id, definitionId: def.id } });
    expect(historico).toHaveLength(2); // as duas emissões continuam existindo
  });
});
