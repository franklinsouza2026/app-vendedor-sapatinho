// Governança de modelos (Fatia 7.5B, seção 44) — o Admin só escolhe entre um
// conjunto conhecido por provider, nunca uma string arbitrária (evita apontar
// pra um endpoint/modelo inexistente ou perigoso). Atualizar esta lista
// quando novos modelos forem lançados; não hardcode em UI/rotas separadas.
import { NomeProviderIA } from '@prisma/client';

export const MODELOS_PERMITIDOS: Record<Exclude<NomeProviderIA, 'MOCK'>, string[]> = {
  ANTHROPIC: ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5'],
  OPENAI: ['gpt-5.1', 'gpt-5.1-mini'],
  GEMINI: ['gemini-3-pro', 'gemini-3-flash'],
};

export const MODELO_PADRAO: Record<Exclude<NomeProviderIA, 'MOCK'>, string> = {
  ANTHROPIC: 'claude-sonnet-5',
  OPENAI: 'gpt-5.1-mini',
  GEMINI: 'gemini-3-flash',
};

export function modeloValido(provider: NomeProviderIA, model: string): boolean {
  if (provider === 'MOCK') return true;
  return MODELOS_PERMITIDOS[provider].includes(model);
}
