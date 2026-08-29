// Utilitário de teste manual: enfileira 1 execução imediata do sync-erp
// (o job repetível normal só dispara na virada da hora). Não faz parte do fluxo de produção.
import { syncErpQueue } from '../src/queues/sync-erp.queue';

async function main() {
  const job = await syncErpQueue.add('sync-todas-lojas-manual', {});
  console.log('Job enfileirado:', job.id);
  process.exit(0);
}

main();
