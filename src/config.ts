import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  APP_NAME: z.string().min(1).default('app-vendedor-sapatinho'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET deve ter pelo menos 32 chars'),
  JWT_ISSUER: z.string().default('app-vendedor-sapatinho'),

  // Identidade/CPF (Fatia 7.5A) — segredo do HMAC determinístico usado pra
  // hash de CPF (nunca reversível, ver src/identidade/cpf.ts). Mesma barra
  // mínima de entropia do JWT_SECRET, nunca deve ter o mesmo valor (rotação
  // independente: trocar um não deveria invalidar o outro).
  CPF_HASH_SECRET: z.string().min(32, 'CPF_HASH_SECRET deve ter pelo menos 32 chars'),
  // Validade do token de ativação enviado pelo Admin ao pré-autorizar um
  // vendedor — padrão 7 dias (168h), configurável sem deploy de código.
  ACTIVATION_TOKEN_TTL_HOURS: z.coerce.number().int().positive().default(168),

  DATABASE_URL: z.string().url('DATABASE_URL invalido'),
  REDIS_URL: z.string().url(),

  ERP_MODE: z.enum(['mock', 'linx']).default('mock'),
  LINX_API_URL: z.union([z.string().url(), z.literal('')]).optional(),
  LINX_API_KEY: z.string().optional(),

  // Coach IA (Fatia 4) — provider desacoplado, mock por padrão em dev/test/CI.
  // A ausência de ANTHROPIC_API_KEY nunca bloqueia o app: só impede
  // AI_PROVIDER=anthropic de funcionar de verdade.
  AI_PROVIDER: z.enum(['mock', 'anthropic']).default('mock'),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default('claude-opus-5'),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(400), // respostas curtas por padrão
  AI_MAX_INPUT_CHARS: z.coerce.number().int().positive().default(4000),
  AI_CONVERSATION_WINDOW: z.coerce.number().int().positive().default(16), // últimas N mensagens enviadas ao provider
  AI_DAILY_MESSAGE_LIMIT_DEFAULT: z.coerce.number().int().positive().default(20), // usado só no seed — o valor real fica em AIBudgetConfig por empresa
  AI_MONTHLY_BUDGET_USD_DEFAULT: z.coerce.number().positive().default(20), // idem

  // Rate limit HTTP geral/login — configurável pra permitir headroom maior em
  // dev/E2E (Playwright roda várias jornadas completas em segundos, sem a
  // cadência de um humano real) sem alterar o valor padrão de produção.
  API_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(120),
  LOGIN_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(10),

  // Simulador (Fatia 6) — mínimo de turnos do vendedor pra uma sessão ser
  // elegível a recompensa (anti-farm de "abrir e fechar na hora"). Não vem
  // da fonte de verdade (não havia regra definida) — v1 documentado, fácil
  // de ajustar via env sem precisar de deploy de código.
  SIMULATION_MIN_TURNS_FOR_REWARD: z.coerce.number().int().positive().default(3),

  // Missões (Fatia 7) — limite de missões diárias ativas por vendedor (seção
  // 13: "evitar 10 missões simultâneas... começar com limite pequeno"). Não
  // vem da fonte de verdade — v1 documentado, ajustável via env.
  MISSOES_MAX_ATIVAS_POR_DIA: z.coerce.number().int().positive().default(3),

  // Admin AI Control Plane (Fatia 7.5B) — chave mestre de criptografia das
  // credenciais de provider por empresa (AES-256-GCM, ver src/ai-platform/
  // secrets.ts). OPCIONAL de propósito (seção 24): sua ausência nunca derruba
  // o processo — só impede salvar uma credencial real de provider até
  // existir, MOCK continua 100% funcional em dev/test/CI sem ela.
  AI_SECRETS_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-f]{64}$/i, 'AI_SECRETS_ENCRYPTION_KEY deve ter exatamente 64 caracteres hex (32 bytes)')
    .optional(),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('\n🔴 ENVIRONMENT VALIDATION FAILED:\n');
    result.error.errors.forEach((err) => {
      console.error(`  ❌ ${err.path.join('.')}: ${err.message}`);
    });
    console.error('\nFix .env e tente de novo.\n');
    process.exit(1);
  }

  if (result.data.ERP_MODE === 'linx' && (!result.data.LINX_API_URL || !result.data.LINX_API_KEY)) {
    console.error('\n🔴 ERP_MODE=linx exige LINX_API_URL e LINX_API_KEY definidos.\n');
    process.exit(1);
  }

  return result.data;
}

export const env = validateEnv();
