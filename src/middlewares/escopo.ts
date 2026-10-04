// Escopo de loja por papel — FONTE ÚNICA (Fase 1, auditoria §22 achado A).
//
// Antes havia 3 cópias de `lojaRestritaDe` que devolviam `undefined` (= empresa
// inteira) para QUALQUER papel diferente de GERENTE — fail-open: incluir um
// papel novo numa rota com essa função liberaria a empresa toda. Agora é
// deny-by-default: só ADMIN vê a empresa inteira, GERENTE vê a própria loja,
// qualquer outro papel é recusado.
import { Request } from 'express';
import { ErroHttp } from '../utils/erro-http';

export function lojaRestritaDe(req: Pick<Request, 'auth'>): string | undefined {
  const auth = req.auth;
  if (!auth) throw new ErroHttp(401, 'unauthenticated', 'sessão inválida');
  if (auth.papel === 'ADMIN') return undefined;
  if (auth.papel === 'GERENTE') return auth.lojaId;
  throw new ErroHttp(403, 'forbidden', 'papel sem escopo de equipe');
}
