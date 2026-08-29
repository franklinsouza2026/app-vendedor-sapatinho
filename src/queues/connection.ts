import Redis from 'ioredis';
import { env } from '../config';

export const connection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null, // exigido pelo BullMQ
  enableReadyCheck: false,
});
