// Teste-guarda de isolamento de fixtures (Fatia 9.7, P1).
//
// A auditoria encontrou o ambiente de dev com 31 "Gerente E2E", 21 "Vendedor
// E2E" e 31 "Loja E2E" acumulados, e o banco de teste com 35 mil vendedores —
// resultado de specs que criavam dado com sufixo aleatório e nunca removiam.
//
// A correção foi estrutural (identidade fixa + upsert, ver `fixtures.ts`), e
// este teste existe pra que a correção não se perca em silêncio: se alguém
// voltar a criar fixture com `randomUUID()` numa jornada, a contagem cresce e
// isto falha.
import { PrismaClient } from '@prisma/client';
import { expect, test } from '@playwright/test';
import {
  LOJA_AUXILIAR_E2E,
  MATRICULAS_E2E,
  PREFIXO_E2E,
  contarFixturesE2E,
  garantirLojaAuxiliarE2E,
  garantirPessoaE2E,
} from './fixtures';

const prisma = new PrismaClient();

test.describe('Isolamento de fixtures E2E', () => {
  test('repetir a criação de fixtures NÃO aumenta o resíduo no banco (upsert, não create)', async () => {
    const vend001 = await prisma.vendedor.findFirstOrThrow({ where: { matriculaErp: 'VEND001' } });

    // 1ª criação — pode ou não já existir de uma execução anterior.
    await garantirLojaAuxiliarE2E(prisma, vend001.empresaId);
    await garantirPessoaE2E(prisma, {
      matriculaErp: MATRICULAS_E2E.vendedorMissoes,
      nome: 'Vendedor Missões E2E',
      empresaId: vend001.empresaId,
      lojaId: vend001.lojaId,
    });

    const antes = await contarFixturesE2E(prisma);

    // Repete tudo 3 vezes, como se a suíte tivesse rodado de novo.
    for (let i = 0; i < 3; i++) {
      const loja = await garantirLojaAuxiliarE2E(prisma, vend001.empresaId);
      await garantirPessoaE2E(prisma, {
        matriculaErp: MATRICULAS_E2E.vendedorMissoes,
        nome: 'Vendedor Missões E2E',
        empresaId: vend001.empresaId,
        lojaId: vend001.lojaId,
      });
      await garantirPessoaE2E(prisma, {
        matriculaErp: MATRICULAS_E2E.vendedorOutraLoja,
        nome: 'Vendedor de Outra Loja',
        empresaId: vend001.empresaId,
        lojaId: loja.id,
      });
    }

    const depois = await contarFixturesE2E(prisma);

    expect(depois.lojas).toBe(antes.lojas);
    // vendedorOutraLoja pode ser novo na 1ª execução, mas nunca cresce depois.
    expect(depois.vendedores).toBeLessThanOrEqual(antes.vendedores + 1);

    // E de fato existe no máximo UMA loja auxiliar, nunca uma pilha delas.
    const auxiliares = await prisma.loja.count({ where: { codigoErp: LOJA_AUXILIAR_E2E.codigoErp } });
    expect(auxiliares).toBe(1);
  });

  test('fixtures E2E são reconhecíveis e não se confundem com dado de seed', async () => {
    // Todo dado de fixture carrega o marcador; nenhum dado de seed carrega.
    for (const matricula of Object.values(MATRICULAS_E2E)) {
      expect(matricula.startsWith(PREFIXO_E2E)).toBe(true);
    }
    for (const matriculaDeSeed of ['VEND001', 'VEND002', 'GER001', 'ADM001']) {
      expect(matriculaDeSeed.startsWith(PREFIXO_E2E)).toBe(false);
    }

    // E as contas de seed continuam existindo e intactas — nenhum teste as toca.
    const seed = await prisma.vendedor.count({ where: { matriculaErp: { in: ['VEND001', 'VEND002', 'GER001', 'ADM001'] } } });
    expect(seed).toBe(4);
  });
});
