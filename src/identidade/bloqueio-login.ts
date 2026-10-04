// Bloqueio por CONTA contra força bruta (Fase 1, T5) — complementa o rate
// limit por IP: 5 tentativas erradas para a mesma (loja, matrícula) em 15 min
// travam a conta por 15 min, venha de quantos IPs vier. A chave não depende
// de a conta existir (não revela se a matrícula é válida). Redis compartilhado
// entre réplicas da API.
import Redis from 'ioredis';
import { env } from '../config';
import { createLogger } from '../utils/logger';

const log = createLogger('identidade:bloqueio-login');

export const MAX_TENTATIVAS = 5;
export const JANELA_SEGUNDOS = 15 * 60;

let cliente: Redis | null = null;
function redis() {
  // enableOfflineQueue precisa ficar LIGADO: desligado, todo comando emitido
  // enquanto a conexão sobe (partida da API, reconexão) falhava na hora e a
  // tentativa errada simplesmente não era contada — força bruta passava na
  // janela de conexão (achado do Security Gate). Com fila + 1 retry + timeout
  // curto, Redis realmente fora continua caindo no catch abaixo em segundos.
  if (!cliente) cliente = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: true, connectTimeout: 2000, commandTimeout: 2000 });
  return cliente;
}

const chave = (lojaId: string, matricula: string) => `login-falhas:${lojaId}:${matricula.toLowerCase()}`;

export async function estaBloqueado(lojaId: string, matricula: string): Promise<boolean> {
  try {
    const n = Number(await redis().get(chave(lojaId, matricula)));
    return n >= MAX_TENTATIVAS;
  } catch (err) {
    // Redis fora do ar não pode virar "login liberado sem limite" nem "ninguém entra":
    // o rate limit por IP continua valendo; registra para a Saúde.
    log.error({ err }, 'bloqueio por conta indisponível (Redis)');
    return false;
  }
}

export async function registrarFalha(lojaId: string, matricula: string): Promise<number> {
  try {
    const k = chave(lojaId, matricula);
    const n = await redis().incr(k);
    if (n === 1) await redis().expire(k, JANELA_SEGUNDOS);
    return n;
  } catch (err) {
    log.error({ err }, 'não foi possível registrar falha de login (Redis)');
    return 0;
  }
}

export async function limparFalhas(lojaId: string, matricula: string) {
  try {
    await redis().del(chave(lojaId, matricula));
  } catch {
    // sem efeito de segurança: o contador expira sozinho
  }
}
