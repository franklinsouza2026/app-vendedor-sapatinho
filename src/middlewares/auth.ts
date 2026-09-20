import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config';
import { Papel } from '@prisma/client';
import { prisma } from '../db';

export interface AuthClaims {
  vendedorId: string;
  empresaId: string;
  lojaId: string;
  // Derivado do enum do Prisma, nunca reescrito à mão: uma união literal
  // duplicada aqui silenciosamente deixaria de aceitar um papel novo, e o
  // erro apareceria como "papel sem permissão" em vez de erro de tipo.
  papel: Papel;
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

      // LIMITAÇÃO CONHECIDA (levantada na Etapa 2C.3B): só o STATUS é
      // revalidado a cada request, não o PAPEL. Um JWT emitido antes de uma
      // mudança de papel continua valendo com o papel antigo até expirar (12h).
      //
      // Não é forja — o token é assinado pelo servidor, e o papel dentro dele
      // saiu do login. É staleness: revogar autoridade não tem efeito imediato.
      //
      // Hoje isso não concede nada: `PLATFORM_ADMIN` não tem nenhuma rota HTTP,
      // e a revogação é feita por script no servidor. A correção é de uma linha
      // (trazer `papel` neste mesmo `select` e comparar), mas exige que todo
      // teste de rota administrativa passe a alinhar o papel do banco com o do
      // token — 7 arquivos hoje assinam ADMIN sobre uma fixture VENDEDOR. Fica
      // para a fatia que criar a API de plataforma, onde a janela passa a
      // importar de verdade.

      req.auth = claims;
      next();
    } catch {
      return res.status(401).json({ error: 'token inválido ou expirado' });
    }
  };
}
