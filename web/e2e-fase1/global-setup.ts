/** Sobe o WORKER do E2E (sync, fechamento, relógio de campanhas) e o derruba no fim. */
import { spawn } from 'node:child_process';
import { envBackendE2E, RAIZ } from './ambiente';

export default async function globalSetup() {
  const worker = spawn('npx', ['tsx', 'src/worker.ts'], { cwd: RAIZ, env: { ...process.env, ...envBackendE2E() }, stdio: 'ignore', detached: true });
  await new Promise((r) => setTimeout(r, 4000));
  return async () => {
    try {
      process.kill(-worker.pid!, 'SIGTERM');
    } catch {
      // já encerrado
    }
  };
}
