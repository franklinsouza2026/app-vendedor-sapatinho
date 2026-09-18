import { Papel } from '../types';

/**
 * Landing por papel (Fatia 9.7, P1). Antes, todo mundo caía em "/" e o ADMIN
 * via a Home de vendedor — com meta, missões e ranking que não são dele.
 *
 * Isto é só ROTEAMENTO DE EXPERIÊNCIA: o backend continua sendo a única
 * autoridade de acesso (`requireAuth` em cada rota + `RequireAuth` no cliente).
 * Mandar alguém pra uma tela não concede permissão nenhuma — se o papel não
 * puder ver aquilo, a API responde 403 do mesmo jeito.
 */
export function rotaInicialPara(papel: Papel): string {
  // ADMIN tem shell próprio (desktop-first, fora do Layout mobile do vendedor).
  if (papel === 'ADMIN') return '/admin/usuarios';
  // GERENTE e VENDEDOR compartilham "/", que já resolve a Home certa por papel.
  return '/';
}
