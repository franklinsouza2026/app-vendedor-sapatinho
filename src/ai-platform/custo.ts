// Tabela de custo estimado por provider+modelo (seção 17/18 da fonte de
// verdade da Fatia 7.5B) — versionada e centralizada aqui, nunca hard-coded
// espalhado pelo código. Anthropic: preços aproximados (cache de pricing
// consultado em 2026-06-24 via documentação Anthropic). OpenAI/Gemini:
// AINDA NÃO fornecidos formalmente neste repositório — valores abaixo são
// PLACEHOLDER explícito (nunca "fonte de faturamento real"), documentado
// como pendente de atualização pelo Admin quando a Fatia 7.5B ganhar edição
// de preços pela UI. Custo é sempre ESTIMATIVA, nunca o valor exato da
// fatura do provider.
export interface FaixaPreco {
  input: number;
  output: number;
}

export const CUSTO_USD_POR_MILHAO_TOKENS: Record<string, Record<string, FaixaPreco>> = {
  anthropic: {
    'claude-opus-5': { input: 5.0, output: 25.0 },
    'claude-sonnet-5': { input: 2.0, output: 10.0 },
    'claude-haiku-4-5': { input: 1.0, output: 5.0 },
  },
  // PLACEHOLDER — preço real da OpenAI não fornecido/confirmado neste repo.
  openai: {
    'gpt-5.1': { input: 5.0, output: 20.0 },
    'gpt-5.1-mini': { input: 1.0, output: 4.0 },
  },
  // PLACEHOLDER — preço real do Gemini não fornecido/confirmado neste repo.
  gemini: {
    'gemini-3-pro': { input: 3.0, output: 15.0 },
    'gemini-3-flash': { input: 0.5, output: 2.0 },
  },
};

const CUSTO_PADRAO_SE_DESCONHECIDO: FaixaPreco = { input: 5.0, output: 25.0 };

export function calcularCustoEstimadoUSD(provider: string, model: string, inputTokens: number, outputTokens: number): number {
  const tabela = CUSTO_USD_POR_MILHAO_TOKENS[provider]?.[model] ?? CUSTO_PADRAO_SE_DESCONHECIDO;
  return (inputTokens / 1_000_000) * tabela.input + (outputTokens / 1_000_000) * tabela.output;
}
