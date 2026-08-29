import rateLimit from 'express-rate-limit';
import { env } from '../config';

export const apiRateLimit = rateLimit({
  windowMs: 60_000,
  limit: env.API_RATE_LIMIT_PER_MINUTE, // por vendedor/IP a cada minuto — generoso pra polling do dashboard
  standardHeaders: true,
  legacyHeaders: false,
});

export const loginRateLimit = rateLimit({
  windowMs: 60_000,
  limit: env.LOGIN_RATE_LIMIT_PER_MINUTE, // login é alvo de brute-force — bem mais restrito
  standardHeaders: true,
  legacyHeaders: false,
});
