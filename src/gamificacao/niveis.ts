// Curva de XP por nível — seção 13 da fonte de verdade pede níveis
// conceituais (Bronze..Elite) com "curva exata configurável", sem definir
// os números. Decisão v1 explícita (documentada em 05-Decisoes-e-Tradeoffs.md):
// curva geométrica simples, marcada como versão 1 — pode evoluir sem
// impactar XP já concedido (XP histórico nunca é recalculado).
export const NIVEL_XP_V1 = [
  { nivel: 1, nome: 'Bronze', xpMinimo: 0 },
  { nivel: 2, nome: 'Prata', xpMinimo: 300 },
  { nivel: 3, nome: 'Ouro', xpMinimo: 800 },
  { nivel: 4, nome: 'Platina', xpMinimo: 1800 },
  { nivel: 5, nome: 'Diamante', xpMinimo: 3500 },
  { nivel: 6, nome: 'Elite', xpMinimo: 6000 },
] as const;

export interface NivelAtual {
  versao: number;
  nivel: number;
  nome: string;
  xpAtual: number;
  xpProximoNivel: number | null; // null = já está no nível máximo
}

export function calcularNivel(xpTotal: number): NivelAtual {
  let atual: (typeof NIVEL_XP_V1)[number] = NIVEL_XP_V1[0];
  for (const n of NIVEL_XP_V1) {
    if (xpTotal >= n.xpMinimo) atual = n;
  }

  const idx = NIVEL_XP_V1.findIndex((n) => n.nivel === atual.nivel);
  const proximo = NIVEL_XP_V1[idx + 1] ?? null;

  return {
    versao: 1,
    nivel: atual.nivel,
    nome: atual.nome,
    xpAtual: xpTotal,
    xpProximoNivel: proximo ? proximo.xpMinimo : null,
  };
}
