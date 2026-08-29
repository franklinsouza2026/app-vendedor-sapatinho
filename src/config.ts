import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  APP_NAME: z.string().min(1).default('app-vendedor-sapatinho'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET deve ter pelo menos 32 chars'),
  JWT_ISSUER: z.string().default('app-vendedor-sapatinho'),

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
