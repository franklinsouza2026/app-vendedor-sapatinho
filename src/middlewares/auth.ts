import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config';

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
  return (req: Request, res: Response, next: NextFunction) => {
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

      req.auth = claims;
      next();
    } catch {
      return res.status(401).json({ error: 'token inválido ou expirado' });
    }
  };
}
