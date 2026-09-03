// Reunião do Dia — roteiro determinístico (Fatia 9.6, seção 35-37): sempre
// existe com IA OFF, nunca causal, nunca fabrica alerta.
import { describe, expect, it } from 'vitest';
import { prisma } from '../db';
import { criarFixtureEmpresa } from '../gamificacao/test-helpers';
import { montarDailyHuddle } from './daily-huddle.service';
import { sincronizarAlertasDaLoja } from './alerts.service';

describe('montarDailyHuddle — roteiro (seção 37)', () => {
  it('sem nenhuma situação identificada, roteiro ainda existe com foco/pergunta/ação neutros e positivos', async () => {
    const { empresa, loja } = await criarFixtureEmpresa();
    const huddle = await montarDailyHuddle(empresa.id, loja.id);

    expect(huddle.roteiro.foco).toBeTruthy();
    expect(huddle.roteiro.contexto).toBeTruthy();
    expect(huddle.roteiro.mensagemPrincipal).toBeTruthy();
    expect(huddle.roteiro.perguntaParaEquipe).toBeTruthy();
    expect(huddle.roteiro.acaoDoDia).toBeTruthy();
    expect(huddle.roteiro.fechamentoPositivo).toBeTruthy();
    // Nunca causal (seção 43/44) — nenhum template usa "porque"/"desmotivado".
    expect(huddle.roteiro.mensagemPrincipal.toLowerCase()).not.toContain('porque');
    expect(huddle.roteiro.mensagemPrincipal.toLowerCase()).not.toContain('desmotivado');
  });

  it('com um alerta real aberto, foco/pergunta/ação refletem o tipo do alerta prioritário', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    await prisma.baselinePessoal.create({ data: { vendedorId: vendedor.id, metrica: 'PA', valor: 3, amostras: 10, amostraMinima: 5 } });
    await prisma.indicadorRealizado.create({
      data: { empresaId: empresa.id, lojaId: loja.id, vendedorId: vendedor.id, dataHora: new Date(), faturamento: 100, ticketMedio: 100, pa: 1, numAtendimentos: 5, fonteJobId: 'test' },
    });
    await sincronizarAlertasDaLoja(empresa.id, loja.id);

    const huddle = await montarDailyHuddle(empresa.id, loja.id);
    expect(huddle.roteiro.foco).toContain('PA');
    expect(huddle.roteiro.perguntaParaEquipe).toContain('produto complementar');
  });

  it('funciona 100% sem chamar IA nenhuma (sem managerId, nunca dispara MANAGER_BRIEF_GENERATED)', async () => {
    const { empresa, loja } = await criarFixtureEmpresa();
    await montarDailyHuddle(empresa.id, loja.id);
    const eventos = await prisma.auditEvent.count({ where: { empresaId: empresa.id, acao: 'MANAGER_BRIEF_GENERATED' } });
    expect(eventos).toBe(0);
  });
});
