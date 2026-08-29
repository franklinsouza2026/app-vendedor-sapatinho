import rateLimit from 'express-rate-limit';

export const apiRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 120, // por vendedor/IP a cada minuto — generoso pra polling do dashboard
  standardHeaders: true,
  legacyHeaders: false,
});

export const loginRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 10, // login é alvo de brute-force — bem mais restrito
  standardHeaders: true,
  legacyHeaders: false,
});
