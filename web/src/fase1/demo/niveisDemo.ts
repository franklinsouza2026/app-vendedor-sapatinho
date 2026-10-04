/**
 * Espelho da curva de níveis do backend (`src/gamificacao/niveis.ts`, v1).
 * Usado SÓ pelos cenários de demonstração (testes de interface). No app
 * real o nível vem pronto do servidor em GET /app/painel (`dados.nivel`).
 * Os nomes NÃO foram alterados (Bronze → Elite).
 */
export const NIVEIS_V1 = [
  { nivel: 1, nome: 'Bronze', xpMinimo: 0 },
  { nivel: 2, nome: 'Prata', xpMinimo: 300 },
  { nivel: 3, nome: 'Ouro', xpMinimo: 800 },
  { nivel: 4, nome: 'Platina', xpMinimo: 1800 },
  { nivel: 5, nome: 'Diamante', xpMinimo: 3500 },
  { nivel: 6, nome: 'Elite', xpMinimo: 6000 },
] as const;

export interface NivelCalculado {
  nivel: number;
  nome: string;
  xpInicioNivel: number;
  proximo: { nivel: number; nome: string; xpMinimo: number } | null;
  /** XP que falta para o próximo nível. null no nível máximo. */
  faltaXp: number | null;
  /** Progresso DENTRO do nível atual (0..100). */
  progresso: number;
}

export function calcularNivel(xpTotal: number): NivelCalculado {
  let idx = 0;
  NIVEIS_V1.forEach((n, i) => {
    if (xpTotal >= n.xpMinimo) idx = i;
  });
  const atual = NIVEIS_V1[idx];
  const proximo = NIVEIS_V1[idx + 1] ?? null;
  const progresso = proximo ? ((xpTotal - atual.xpMinimo) / (proximo.xpMinimo - atual.xpMinimo)) * 100 : 100;
  return {
    nivel: atual.nivel,
    nome: atual.nome,
    xpInicioNivel: atual.xpMinimo,
    proximo: proximo ? { ...proximo } : null,
    faltaXp: proximo ? proximo.xpMinimo - xpTotal : null,
    progresso,
  };
}
