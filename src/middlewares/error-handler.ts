import { NextFunction, Request, Response } from 'express';
import { logger } from '../utils/logger';

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  logger.error({ err, path: req.path, method: req.method }, 'erro não tratado');

  if (res.headersSent) return;

  res.status(500).json({ error: 'erro interno' });
}
