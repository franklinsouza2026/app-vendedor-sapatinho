import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config';
import { prisma } from '../db';

export interface AuthClaims {
  vendedorId: string;
  empresaId: string;
  lojaId: string;
  papel: 'VENDEDOR' | 'GERENTE' | 'ADMIN';
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthClaims;
    }
  }
}

export function assinarToken(claims: AuthClaims): string {
  return jwt.sign(claims, env.JWT_SECRET, { issuer: env.JWT_ISSUER, expiresIn: '12h' });
}

export function requireAuth(...papeisPermitidos: AuthClaims['papel'][]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'token ausente' });
    }

    try {
      const token = header.slice('Bearer '.length);
      const claims = jwt.verify(token, env.JWT_SECRET, { issuer: env.JWT_ISSUER }) as AuthClaims;

      if (papeisPermitidos.length > 0 && !papeisPermitidos.includes(claims.papel)) {
        return res.status(403).json({ error: 'papel sem permissão para este recurso' });
      }

      // A conta pode ter sido bloqueada/desligada depois deste JWT ter sido
      // emitido (válido por até 12h) — sem este check, um token antigo
      // continuaria funcionando normalmente até expirar sozinho (Fatia 7.5A,
      // seção 14: "JWT anterior deve deixar de ser utilizável tão cedo quanto
      // a arquitetura permitir com segurança"). Nesta escala (porte 2, apps
      // internos) uma consulta extra por request é um custo aceitável — a
      // alternativa (lista de revogação/JWT de vida curta) é over-engineering
      // pro tamanho atual do produto.
      const vendedor = await prisma.vendedor.findUnique({ where: { id: claims.vendedorId }, select: { status: true } });
      if (!vendedor || vendedor.status !== 'ACTIVE') {
        return res.status(401).json({ error: 'sessão inválida' });
      }

      req.auth = claims;
      next();
    } catch {
      return res.status(401).json({ error: 'token inválido ou expirado' });
    }
  };
}
