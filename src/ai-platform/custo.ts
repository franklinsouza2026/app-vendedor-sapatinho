// Tabela de custo estimado por modelo (seção 24 da fonte de verdade) —
// versionada e centralizada aqui, nunca hard-coded espalhado pelo código.
// Preços aproximados (cache de pricing consultado em 2026-06-24 via
// documentação Anthropic) — usados só pra ESTIMAR gasto e aplicar o budget
// mensal, nunca como fonte de faturamento real. Atualizar aqui quando os
// preços da Anthropic mudarem; nenhum outro arquivo deve conhecer preço.
export const CUSTO_USD_POR_MILHAO_TOKENS: Record<string, { input: number; output: number }> = {
  'claude-opus-5': { input: 5.0, output: 25.0 },
  'claude-sonnet-5': { input: 2.0, output: 10.0 },
  'claude-haiku-4-5': { input: 1.0, output: 5.0 },
};

const CUSTO_PADRAO_SE_MODELO_DESCONHECIDO = { input: 5.0, output: 25.0 };

export function calcularCustoEstimadoUSD(model: string, inputTokens: number, outputTokens: number): number {
  const tabela = CUSTO_USD_POR_MILHAO_TOKENS[model] ?? CUSTO_PADRAO_SE_MODELO_DESCONHECIDO;
  return (inputTokens / 1_000_000) * tabela.input + (outputTokens / 1_000_000) * tabela.output;
}
