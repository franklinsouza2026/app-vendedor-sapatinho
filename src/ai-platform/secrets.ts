// Criptografia autenticada de credenciais de provider (Fatia 7.5B, seção 23)
// — AES-256-GCM, nonce aleatório por escrita, auth tag verificada na leitura.
// Chave mestre vem de env (`AI_SECRETS_ENCRYPTION_KEY`, 32 bytes hex, nunca
// hardcoded, nunca a mesma do JWT_SECRET/CPF_HASH_SECRET). Opcional na
// validação de env (seção 24): ausência não derruba o processo — só impede
// SALVAR uma credencial real até a chave existir, MOCK continua funcional.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '../config';
import { IdentidadeError } from '../identidade/erros';

const ALGORITMO = 'aes-256-gcm';

export interface SegredoCifrado {
  ciphertextBase64: string;
  ivBase64: string;
  authTagBase64: string;
  keyVersion: number;
}

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
  const iv = randomBytes(12); // 96 bits — tamanho recomendado pro GCM
  const cifra = createCipheriv(ALGORITMO, chaveMestre(), iv);
  const ciphertext = Buffer.concat([cifra.update(textoPlano, 'utf8'), cifra.final()]);
  const authTag = cifra.getAuthTag();

  return {
    ciphertextBase64: ciphertext.toString('base64'),
    ivBase64: iv.toString('base64'),
    authTagBase64: authTag.toString('base64'),
    keyVersion: 1,
  };
}

export function decifrarSegredo(segredo: SegredoCifrado): string {
  const decifra = createDecipheriv(ALGORITMO, chaveMestre(), Buffer.from(segredo.ivBase64, 'base64'));
  decifra.setAuthTag(Buffer.from(segredo.authTagBase64, 'base64'));
  const textoPlano = Buffer.concat([decifra.update(Buffer.from(segredo.ciphertextBase64, 'base64')), decifra.final()]);
  return textoPlano.toString('utf8');
}
