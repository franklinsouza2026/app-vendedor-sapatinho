// Rótulos PT-BR (Etapa 2A).
//
// POR QUE ESTE ARQUIVO EXISTE: `labelTipoItemPDI` cobria 5 dos 8 valores do
// enum `TipoItemPDI`. Quando a etapa do plano passou a aparecer na tela do
// vendedor, ele lia "PRACTICE" e "MANAGER_ACTION" no próprio plano de
// desenvolvimento. O mapa é escrito à mão e o schema cresce — sem este teste, o
// próximo valor de enum vaza igual, em silêncio.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { labelTipoItemPDI, labelStatusPDI } from './labels';

/** Lê os valores de um enum direto do schema — fonte de verdade do backend. */
function valoresDoEnum(nome: string): string[] {
  const schema = readFileSync(join(__dirname, '../../../prisma/schema.prisma'), 'utf8');
  const bloco = schema.match(new RegExp(`enum ${nome} \\{([^}]+)\\}`))![1];
  return bloco.split('\n').map((l) => l.trim()).filter(Boolean);
}

describe('rótulos cobrem o schema inteiro', () => {
  it('todo TipoItemPDI tem tradução — nenhum enum cru chega ao vendedor', () => {
    const valores = valoresDoEnum('TipoItemPDI');
    expect(valores.length).toBeGreaterThan(5); // sanidade: leu o schema mesmo

    for (const valor of valores) {
      expect(labelTipoItemPDI(valor), `TipoItemPDI.${valor} sem rótulo PT-BR`).not.toBe(valor);
    }
  });

  // `labelStatusPDI` atende DOIS enums. Cobrir só um deixava passar `PAUSED`,
  // que o vendedor lia cru assim que um Admin pausasse o plano dele.
  it('todo StatusItemPDI tem tradução', () => {
    for (const valor of valoresDoEnum('StatusItemPDI')) {
      expect(labelStatusPDI(valor), `StatusItemPDI.${valor} sem rótulo PT-BR`).not.toBe(valor);
    }
  });

  it('todo StatusPDI tem tradução — o status do plano vai pra tela do vendedor', () => {
    for (const valor of valoresDoEnum('StatusPDI')) {
      expect(labelStatusPDI(valor), `StatusPDI.${valor} sem rótulo PT-BR`).not.toBe(valor);
    }
  });
});
