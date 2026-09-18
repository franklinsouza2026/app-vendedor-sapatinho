// Simulador Gerencial — JORNADA COMPLETA (Fatia 9.7, P0).
//
// Por que este arquivo existe: a Fatia 9.6 entregou o Simulador Gerencial com
// E2E verde, mas o E2E só verificava a LISTAGEM de cenários. A sessão gerencial
// quebrava do 2º turno em diante, porque `resolverCenario` era chamado sem o
// papel em 2 dos 3 call sites e caía no default 'VENDEDOR'. Testar só a
// abertura de uma jornada não prova que ela funciona — daí a regra nova da
// fatia: toda jornada precisa de teste ponta a ponta de verdade.
import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../db';
import { criarFixtureEmpresa } from '../gamificacao/test-helpers';
import { criarCenarioTeste } from './test-helpers';
import { criarSessao, encerrarSessao, enviarMensagem, getSessaoDetalhada } from './session.service';

async function criarGerente(empresaId: string, lojaId: string) {
  return prisma.vendedor.create({
    data: {
      empresaId,
      lojaId,
      matriculaErp: `GER-${randomUUID()}`,
      nome: 'Gerente Teste',
      papel: 'GERENTE',
      status: 'ACTIVE',
      senhaHash: 'hash-nao-usado',
    },
  });
}

describe('Simulador Gerencial — jornada completa', () => {
  it('GERENTE abre sessão, conversa vários turnos, encerra e RECEBE avaliação', async () => {
    const { empresa, loja } = await criarFixtureEmpresa();
    const gerente = await criarGerente(empresa.id, loja.id);
    const cenario = await criarCenarioTeste({ category: 'GESTAO_DE_PESSOAS' });

    // 1. Abre a sessão e já recebe a primeira fala do "cliente" simulado.
    const sessao = await criarSessao(gerente.id, cenario.id, 'EASY');
    expect(sessao.status).toBe('ACTIVE');

    // 2. Conversa DE VERDADE — é exatamente aqui que a regressão da 9.6 batia.
    const turno1 = await enviarMensagem({ sessionId: sessao.id, vendedorId: gerente.id, content: 'Vamos conversar sobre sua performance.' });
    expect(turno1.mensagem.role).toBe('CLIENTE');
    expect(turno1.sessao.turnCount).toBe(1);

    const turno2 = await enviarMensagem({ sessionId: sessao.id, vendedorId: gerente.id, content: 'O que tem te atrapalhado?' });
    expect(turno2.sessao.turnCount).toBe(2);

    const turno3 = await enviarMensagem({ sessionId: sessao.id, vendedorId: gerente.id, content: 'Como posso te ajudar nisso?' });
    expect(turno3.sessao.turnCount).toBe(3);

    // 3. Encerra — dispara a avaliação, o outro ponto onde o papel faltava.
    await encerrarSessao(sessao.id, gerente.id);

    // 4. Recebe a avaliação persistida.
    const detalhe = await getSessaoDetalhada(sessao.id, gerente.id);
    expect(['COMPLETED', 'EVALUATED']).toContain(detalhe.sessao.status);
    expect(detalhe.avaliacao).not.toBeNull();
    expect(detalhe.avaliacao!.scoreFinal).toBeGreaterThan(0);

    // 5. O transcript inteiro ficou persistido (3 falas do gerente + falas do cliente).
    const mensagens = await prisma.simulationMessage.findMany({ where: { sessionId: sessao.id } });
    expect(mensagens.filter((m) => m.role === 'VENDEDOR')).toHaveLength(3);
  });

  it('VENDEDOR faz a mesma jornada completa num cenário de venda (não houve regressão no fluxo original)', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const cenario = await criarCenarioTeste({ category: 'ABORDAGEM' });

    const sessao = await criarSessao(vendedor.id, cenario.id, 'EASY');
    await enviarMensagem({ sessionId: sessao.id, vendedorId: vendedor.id, content: 'Bom dia, posso ajudar?' });
    await enviarMensagem({ sessionId: sessao.id, vendedorId: vendedor.id, content: 'Temos esse modelo em outras cores.' });
    await enviarMensagem({ sessionId: sessao.id, vendedorId: vendedor.id, content: 'Quer experimentar?' });
    await encerrarSessao(sessao.id, vendedor.id);

    const detalhe = await getSessaoDetalhada(sessao.id, vendedor.id);
    expect(detalhe.avaliacao).not.toBeNull();
  });

  it('GERENTE não abre cenário de venda — e o erro é 404 de domínio, nunca 500', async () => {
    const { empresa, loja } = await criarFixtureEmpresa();
    const gerente = await criarGerente(empresa.id, loja.id);
    const cenarioDeVenda = await criarCenarioTeste({ category: 'ABORDAGEM' });

    await expect(criarSessao(gerente.id, cenarioDeVenda.id, 'EASY')).rejects.toMatchObject({ type: 'not_found' });
    expect(await prisma.simulationSession.count({ where: { vendedorId: gerente.id } })).toBe(0);
  });

  it('VENDEDOR não abre cenário gerencial mesmo sabendo o ID exato', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const cenarioGerencial = await criarCenarioTeste({ category: 'GESTAO_DE_PESSOAS' });

    await expect(criarSessao(vendedor.id, cenarioGerencial.id, 'EASY')).rejects.toMatchObject({ type: 'not_found' });
    expect(await prisma.simulationSession.count({ where: { vendedorId: vendedor.id } })).toBe(0);
  });

  it('sessão gerencial encerra sozinha ao bater o limite de turnos e avalia (caminho automático, não só o manual)', async () => {
    const { empresa, loja } = await criarFixtureEmpresa();
    const gerente = await criarGerente(empresa.id, loja.id);
    // maxTurns curto pra exercitar o encerramento automático sem 15 chamadas.
    const cenario = await criarCenarioTeste({ category: 'GESTAO_DE_PESSOAS', maxTurnsPorDificuldade: { EASY: 3 } });

    const sessao = await criarSessao(gerente.id, cenario.id, 'EASY');
    await enviarMensagem({ sessionId: sessao.id, vendedorId: gerente.id, content: 'Primeira.' });
    await enviarMensagem({ sessionId: sessao.id, vendedorId: gerente.id, content: 'Segunda.' });
    const ultimo = await enviarMensagem({ sessionId: sessao.id, vendedorId: gerente.id, content: 'Terceira.' });

    // Ao bater maxTurns o motor finaliza e avalia sem o gerente pedir.
    expect(['COMPLETED', 'EVALUATED']).toContain(ultimo.sessao.status);

    const detalhe = await getSessaoDetalhada(sessao.id, gerente.id);
    expect(detalhe.avaliacao).not.toBeNull();
    expect(detalhe.sessao.reasonEnded).toBe('LIMITE_TURNOS');
  });
});
