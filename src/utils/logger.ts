import pino from 'pino';
import { env } from '../config';

// Redação defensiva (achado de security review da Fatia 4, revisitado na
// Fatia 5 — seção 43): nenhum log deste projeto injeta esses campos hoje
// (erros de provider de IA já chegam normalizados antes de serem logados,
// nunca o objeto cru do SDK), mas isso é resiliência de baixo custo caso um
// dia alguém logue um erro cru por engano ou um objeto de request/response.
// pino-http usa esta mesma instância pra logar req/res — cobre também o
// header Authorization (JWT) das requisições, que sem isso ia pra stdout em
// texto puro a cada request.
const CAMINHOS_REDACT = [
  'req.headers.authorization',
  '*.apiKey',
  '*.ANTHROPIC_API_KEY',
  '*.password',
  '*.senha',
  '*.senhaHash',
  '*.token',
  // Identidade/CPF (Fatia 7.5A) — mesma resiliência de baixo custo: nenhum
  // log deste projeto injeta esses campos hoje, mas CPF é dado pessoal
  // sensível operacionalmente (seção 5) e nunca deveria aparecer em log
  // nem por engano.
  '*.cpf',
  '*.cpfHash',
  '*.tokenHash',
  '*.tokenAtivacao',
];

export function createLogger(name: string) {
  return pino({ name, level: env.LOG_LEVEL, redact: CAMINHOS_REDACT });
}

export const logger = createLogger(env.APP_NAME);
