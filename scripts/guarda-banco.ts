/**
 * Guardas de scripts que APAGAM ou criam dado de demonstração (Onda 8/10).
 *
 * - Nunca em produção (NODE_ENV=production).
 * - Reset destrutivo só em banco descartável (nome terminando em _e2e/_test)
 *   ou com opt-in explícito PERMITIR_RESET_BANCO_DEV=1 para o banco de dev.
 */
export function bancoAtual(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL ausente');
  return new URL(url).pathname.replace(/^\//, '');
}

export function proibirEmProducao(oQue: string) {
  if (process.env.NODE_ENV === 'production') {
    console.error(`recusado: ${oQue} nunca roda com NODE_ENV=production`);
    process.exit(1);
  }
}

export function exigirBancoDescartavel(oQue: string) {
  proibirEmProducao(oQue);
  const banco = bancoAtual();
  if (/_(e2e|test)$/.test(banco)) return;
  if (process.env.PERMITIR_RESET_BANCO_DEV === '1') return;
  console.error(`recusado: ${oQue} apaga dados e o banco "${banco}" não é descartável. Use o E2E isolado (npm run e2e:fase1) ou defina PERMITIR_RESET_BANCO_DEV=1 conscientemente.`);
  process.exit(1);
}
