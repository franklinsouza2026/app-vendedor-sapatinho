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
  // PLATFORM_ADMIN governa conhecimento GLOBAL pelo backend e ainda não tem
  // tela (2C.3B). Mandá-lo pra "/" o colocaria na Home de VENDEDOR, com meta,
  // missões e ranking que não são dele — então vai pro perfil, que é neutro e
  // existe pra todo mundo. Quando houver painel de plataforma, muda aqui.
  if (papel === 'PLATFORM_ADMIN') return '/perfil';
  // GERENTE e VENDEDOR compartilham "/", que já resolve a Home certa por papel.
  return '/';
}
