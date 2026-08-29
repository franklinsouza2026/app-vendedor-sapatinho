import pino from 'pino';
import { env } from '../config';

export function createLogger(name: string) {
  return pino({ name, level: env.LOG_LEVEL });
}

export const logger = createLogger(env.APP_NAME);
