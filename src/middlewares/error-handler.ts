import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { logger } from '../utils/logger';
import { ErroHttp } from '../utils/erro-http';

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (res.headersSent) return;

  // Erro de negócio esperado: status e mensagem já são públicos por construção.
  if (err instanceof ErroHttp) {
    if (err.status >= 500) logger.error({ err, path: req.path, method: req.method }, 'erro de negócio 5xx');
    return res.status(err.status).json({ error: err.message, type: err.type });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'dados inválidos', type: 'invalid', detalhes: err.flatten() });
  }
  // JSON malformado no corpo (express.json) — erro do cliente, nunca 500.
  if (typeof err === 'object' && err !== null && (err as { type?: string }).type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'corpo da requisição inválido', type: 'invalid' });
  }

  logger.error({ err, path: req.path, method: req.method }, 'erro não tratado');
  res.status(500).json({ error: 'erro interno' });
}
