// Criptografia autenticada de credenciais de provider (Fatia 7.5B, seção 23)
// — AES-256-GCM, nonce aleatório por escrita, auth tag verificada na leitura.
// Chave mestre vem de env (`AI_SECRETS_ENCRYPTION_KEY`, 32 bytes hex, nunca
// hardcoded, nunca a mesma do JWT_SECRET/CPF_HASH_SECRET). Opcional na
// validação de env (seção 24): ausência não derruba o processo — só impede
// SALVAR uma credencial real até a chave existir, MOCK continua funcional.
import { cifrarComChave, decifrarComChave, SegredoCifrado } from '../utils/cripto';
import { env } from '../config';
import { IdentidadeError } from '../identidade/erros';

export type { SegredoCifrado };

function chaveMestre(): Buffer {
  if (!env.AI_SECRETS_ENCRYPTION_KEY) {
    throw new IdentidadeError(
      503,
      'ai_secrets_key_ausente',
      'nenhuma chave de criptografia de credenciais de IA configurada neste ambiente (AI_SECRETS_ENCRYPTION_KEY) — configure-a antes de salvar um provider real'
    );
  }
  const chave = Buffer.from(env.AI_SECRETS_ENCRYPTION_KEY, 'hex');
  if (chave.length !== 32) {
    throw new IdentidadeError(503, 'ai_secrets_key_invalida', 'AI_SECRETS_ENCRYPTION_KEY deve ter exatamente 32 bytes (64 caracteres hex)');
  }
  return chave;
}

export function cifrarSegredo(textoPlano: string): SegredoCifrado {
  return cifrarComChave(textoPlano, chaveMestre());
}

export function decifrarSegredo(segredo: SegredoCifrado): string {
  return decifrarComChave(segredo, chaveMestre());
}
