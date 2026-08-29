import { NextFunction, Request, RequestHandler, Response } from 'express';

// Express 4 não captura rejeições de handler async automaticamente — sem
// isso, uma exceção não tratada (ex.: findUniqueOrThrow) vira um
// unhandledRejection e pode derrubar o processo inteiro em vez de virar um
// 500 tratado pelo errorHandler global. Usado nas rotas do Coach, que têm
// vários pontos de falha (vendedor removido com token ainda válido, etc.).
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
