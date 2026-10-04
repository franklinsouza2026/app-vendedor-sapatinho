// Criptografia autenticada de segredos em repouso — AES-256-GCM, nonce
// aleatório por escrita, auth tag verificada na leitura. Núcleo comum das
// credenciais de IA (ai-platform/secrets.ts) e de integração ERP
// (fase1/integracoes/segredos.ts): cada domínio tem a PRÓPRIA chave mestra em
// env (nunca no banco, nunca no repositório), este módulo só cifra/decifra.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITMO = 'aes-256-gcm';

export interface SegredoCifrado {
  ciphertextBase64: string;
  ivBase64: string;
  authTagBase64: string;
  keyVersion: number;
}

export function cifrarComChave(textoPlano: string, chave: Buffer, keyVersion = 1): SegredoCifrado {
  const iv = randomBytes(12); // 96 bits — tamanho recomendado pro GCM
  const cifra = createCipheriv(ALGORITMO, chave, iv);
  const ciphertext = Buffer.concat([cifra.update(textoPlano, 'utf8'), cifra.final()]);
  return { ciphertextBase64: ciphertext.toString('base64'), ivBase64: iv.toString('base64'), authTagBase64: cifra.getAuthTag().toString('base64'), keyVersion };
}

export function decifrarComChave(segredo: SegredoCifrado, chave: Buffer): string {
  const decifra = createDecipheriv(ALGORITMO, chave, Buffer.from(segredo.ivBase64, 'base64'));
  decifra.setAuthTag(Buffer.from(segredo.authTagBase64, 'base64'));
  return Buffer.concat([decifra.update(Buffer.from(segredo.ciphertextBase64, 'base64')), decifra.final()]).toString('utf8');
}

/** Máscara de exibição: só os 4 últimos caracteres, nunca o tamanho real. */
export function mascarar(sufixo: string | null | undefined): string | null {
  return sufixo ? `••••••••${sufixo}` : null;
}
