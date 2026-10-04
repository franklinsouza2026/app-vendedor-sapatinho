// Credenciais de integração (T2): AES-256-GCM com chave mestra em env
// (INTEGRATION_SECRETS_ENCRYPTION_KEY) — separada da chave de IA, fora do
// banco, fora do repositório. A credencial em claro só existe:
//   1) no corpo da requisição do Admin que a define (nunca logado — o logger
//      redige o campo), e
//   2) em memória, durante a chamada ao ERP.
// Nenhuma resposta da API a devolve; o Admin vê só `••••••••abcd`.
import { env } from '../../config';
import { cifrarComChave, decifrarComChave, SegredoCifrado } from '../../utils/cripto';
import { ErroHttp } from '../../utils/erro-http';

function chaveMestra(): Buffer {
  if (!env.INTEGRATION_SECRETS_ENCRYPTION_KEY) {
    throw new ErroHttp(503, 'integration_key_ausente', 'Este ambiente não tem a chave de criptografia de integrações configurada (INTEGRATION_SECRETS_ENCRYPTION_KEY). A credencial não foi salva.');
  }
  return Buffer.from(env.INTEGRATION_SECRETS_ENCRYPTION_KEY, 'hex');
}

export function cifrarCredencial(texto: string): SegredoCifrado {
  return cifrarComChave(texto, chaveMestra());
}

export function decifrarCredencial(segredo: SegredoCifrado): string {
  return decifrarComChave(segredo, chaveMestra());
}

/** Últimos 4 caracteres para a máscara; credencial curta não revela nada. */
export function sufixoDaCredencial(texto: string): string {
  return texto.length >= 12 ? texto.slice(-4) : '';
}
