// Escopo do Manager (Fatia 7.5E, seção 61) — GERENTE só acessa
// desenvolvimento de vendedores da PRÓPRIA loja, mesmo raciocínio de
// `lojaRestritaDe`/`buscarVendedorNoEscopo` já usado em admin.ts/admin.service.ts
// (Fatia 7.5A) — réplica local pra não acoplar este módulo ao de identidade.
import { prisma } from '../db';
import { UniversidadeError } from './constantes';

/** `papel: 'VENDEDOR'` fixo (achado do security review, seção 100: sem
 * isso, um GERENTE passava a própria matrícula como `:vendedorId` e a
 * checagem de escopo passava — "equipe" nunca inclui o próprio GERENTE
 * nem outro GERENTE/ADMIN da mesma loja). */
export async function garantirVendedorNoEscopoDoGerente(subjectUserId: string, empresaId: string, lojaIdRestrita?: string) {
  const vendedor = await prisma.vendedor.findFirst({
    where: { id: subjectUserId, empresaId, papel: 'VENDEDOR', ...(lojaIdRestrita ? { lojaId: lojaIdRestrita } : {}) },
  });
  // Erro genérico — nunca revela se o vendedor existe em outra loja (mesma
  // disciplina anti-IDOR de todo o resto do produto).
  if (!vendedor) throw new UniversidadeError('not_found', 'vendedor não encontrado');
  return vendedor;
}
