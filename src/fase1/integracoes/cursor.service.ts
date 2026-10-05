// Cursor incremental por (integração, método, escopo) — Linx L2.
//
// O valor é o timestamp do Microvix: CONTADOR (rowversion), nunca data. Fica
// em BIGINT no banco e trafega como string de dígitos no código (BigInt do JS
// quando precisa comparar) — nunca passa por Number, então não perde precisão
// acima de Number.MAX_SAFE_INTEGER.
//
// Regras:
//   - só o sync grava, e só DEPOIS de ingerir e reconciliar a página;
//   - nunca retrocede: a gravação é um compare-and-set "só se for maior"
//     dentro do próprio UPDATE (dois workers nunca puxam o cursor para trás);
//   - cursores de empresas, escopos (CNPJ) e métodos diferentes são linhas
//     diferentes — um nunca anda pelo outro.
import { FaseCursorIntegracao, Prisma } from '@prisma/client';
import { prisma } from '../../db';
import { CursorFonte } from '../../integracoes/erp';

/** Maior valor aceito: BIGINT do Postgres (o timestamp do Microvix também é BIGINT). */
export const MAX_CURSOR = 9223372036854775807n;

export class CursorInvalido extends Error {}

/** Valida e normaliza um timestamp da fonte. Aceita só inteiro não negativo que caiba em BIGINT. */
export function normalizarCursor(valor: unknown): string {
  const texto = typeof valor === 'bigint' ? valor.toString() : typeof valor === 'string' ? valor.trim() : '';
  if (!/^\d{1,19}$/.test(texto)) throw new CursorInvalido(`cursor inválido: ${typeof valor === 'string' ? `"${valor.slice(0, 30)}"` : typeof valor}`);
  const n = BigInt(texto);
  if (n > MAX_CURSOR) throw new CursorInvalido('cursor acima do limite BIGINT');
  return n.toString();
}

export function compararCursor(a: string, b: string): -1 | 0 | 1 {
  const x = BigInt(a);
  const y = BigInt(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

export async function carregarCursores(integracaoId: string): Promise<CursorFonte[]> {
  const linhas = await prisma.integracaoCursor.findMany({ where: { integracaoId }, orderBy: [{ metodo: 'asc' }, { escopo: 'asc' }] });
  return linhas.map((l) => ({ metodo: l.metodo, escopo: l.escopo, valor: l.valor.toString(), fase: l.fase }));
}

export interface AvancoCursor {
  metodo: string;
  escopo: string;
  valor: string;
}

export interface ResultadoAvanco {
  avancados: number;
  /** Cursores devolvidos pela fonte ABAIXO do gravado (ignorados; nunca retrocedem). */
  recusadosPorRetrocesso: number;
}

/**
 * Grava os cursores da página JÁ processada. Compare-and-set monotônico:
 * insere se não existe; se existe, só atualiza quando o novo valor é MAIOR.
 * Também ajusta a fase (BACKFILL → CATCH_UP → LIVE) e o contador de registros.
 */
export async function avancarCursores(params: { empresaId: string; integracaoId: string; cursores: AvancoCursor[]; fase: FaseCursorIntegracao; registros: number }): Promise<ResultadoAvanco> {
  let avancados = 0;
  let recusados = 0;
  for (const c of params.cursores) {
    const valor = normalizarCursor(c.valor);
    // Um único statement: o banco decide "maior que o atual" de forma atômica.
    const linhas = await prisma.$queryRaw<{ avancou: boolean }[]>(Prisma.sql`
      INSERT INTO integracao_cursor (id, "empresaId", "integracaoId", metodo, escopo, valor, fase, "registrosProcessados", "ultimoAvancoEm", "createdAt", "updatedAt")
      VALUES (gen_random_uuid()::text, ${params.empresaId}, ${params.integracaoId}, ${c.metodo}, ${c.escopo}, ${valor}::bigint, ${params.fase}::"FaseCursorIntegracao", ${params.registros}, now(), now(), now())
      ON CONFLICT ("integracaoId", metodo, escopo) DO UPDATE
        SET valor = EXCLUDED.valor,
            fase = EXCLUDED.fase,
            "registrosProcessados" = integracao_cursor."registrosProcessados" + EXCLUDED."registrosProcessados",
            "ultimoAvancoEm" = now(),
            "updatedAt" = now()
        WHERE integracao_cursor.valor < EXCLUDED.valor
      RETURNING true AS avancou`);
    if (linhas.length) avancados++;
    else {
      // Igual ou menor que o gravado: não mexe no valor. Só a fase pode mudar (ex.: CATCH_UP → LIVE sem dado novo).
      const atual = await prisma.integracaoCursor.findUnique({ where: { integracaoId_metodo_escopo: { integracaoId: params.integracaoId, metodo: c.metodo, escopo: c.escopo } } });
      if (atual && compararCursor(valor, atual.valor.toString()) < 0) recusados++;
      if (atual && atual.fase !== params.fase && compararCursor(valor, atual.valor.toString()) === 0) {
        await prisma.integracaoCursor.updateMany({ where: { id: atual.id, valor: atual.valor }, data: { fase: params.fase } });
      }
    }
  }
  return { avancados, recusadosPorRetrocesso: recusados };
}

/** Fase de uma execução a partir do estado anterior e de "ainda há páginas". */
export function proximaFase(anterior: FaseCursorIntegracao | null, haMais: boolean): FaseCursorIntegracao {
  if (!haMais) return 'LIVE';
  if (anterior === null || anterior === 'BACKFILL') return 'BACKFILL';
  return 'CATCH_UP';
}
