// CPF é dado pessoal sensível operacionalmente (Fatia 7.5A, seção 5) mesmo
// sem ser "dado sensível" no sentido estrito do art. 5º, II da LGPD. Regra
// desta fatia: NUNCA armazenar/logar/retornar o valor completo depois da
// validação de entrada — só um hash determinístico (pra unicidade/lookup na
// ativação) + os 2 últimos dígitos em claro (suficiente pra máscara na UI).
// Decisão deliberada de NÃO implementar criptografia reversível: nenhum
// fluxo desta fatia precisa recuperar o CPF completo (Admin só vê mascarado —
// seção 17/38), então hash unidirecional evita "inventar criptografia caseira"
// (seção 5) sem abrir mão de nenhuma funcionalidade real. Ver Decisão no vault.
import { createHmac } from 'node:crypto';
import { env } from '../config';

/** Remove tudo que não for dígito. Não valida tamanho/checksum. */
export function normalizarCpf(entrada: string): string {
  return entrada.replace(/\D/g, '');
}

/**
 * Valida estrutura de um CPF (11 dígitos, dígitos verificadores corretos).
 * Rejeita CPFs com todos os dígitos iguais (000.000.000-00, 111.111.111-11,
 * etc.) — passam no cálculo de dígito verificador mas nunca são CPFs reais.
 */
export function validarCpf(cpfNormalizado: string): boolean {
  if (!/^\d{11}$/.test(cpfNormalizado)) return false;
  if (/^(\d)\1{10}$/.test(cpfNormalizado)) return false;

  const digitos = cpfNormalizado.split('').map(Number);

  const d1 = calcularDigitoVerificador(digitos.slice(0, 9));
  if (d1 !== digitos[9]) return false;

  const d2 = calcularDigitoVerificador(digitos.slice(0, 10));
  if (d2 !== digitos[10]) return false;

  return true;
}

function calcularDigitoVerificador(base: number[]): number {
  const pesoInicial = base.length + 1;
  const soma = base.reduce((acc, digito, idx) => acc + digito * (pesoInicial - idx), 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/** `***.***.***-XX` — só os 2 últimos dígitos reais, nunca o CPF completo. */
export function mascararCpf(cpfNormalizado: string): string {
  return `***.***.***-${cpfNormalizado.slice(9, 11)}`;
}

/**
 * Hash determinístico (HMAC-SHA256 com segredo de aplicação) — usado pra
 * unicidade/lookup (ex.: achar o vendedor pré-autorizado na ativação a partir
 * do CPF digitado) sem nunca guardar o CPF em claro. Determinístico por
 * design (mesmo CPF sempre gera o mesmo hash) — não é um hash de senha
 * (nunca precisa de salt por linha: unicidade global/por-empresa é o objetivo,
 * não resistência a rainbow table de um valor de baixa entropia isolado, que
 * um HMAC com segredo de 32+ bytes já cobre suficientemente para este caso de uso).
 */
export function hashCpf(cpfNormalizado: string): string {
  return createHmac('sha256', env.CPF_HASH_SECRET).update(cpfNormalizado).digest('hex');
}
