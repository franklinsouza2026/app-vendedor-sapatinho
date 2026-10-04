/**
 * Contrato entre as telas homologadas da Fase 1 e quem fornece os dados.
 *
 * As telas só conhecem `useFase1()`. Em produção, quem fornece é o provedor
 * REAL (`real/ProvedorVendedor.tsx` — GET /app/painel, dado do servidor). Nos
 * testes de interface, o provedor de DEMONSTRAÇÃO (`demo/Fase1Contexto.tsx`)
 * injeta cenários fixos — ele nunca entra no bundle de produção.
 */
import { createContext, ReactNode, useContext } from 'react';
import type { Celebracao, Fase1Dados, Missao } from './dominio/tipos';

export type EstadoCarga = 'carregando' | 'erro' | 'pronto';

export interface ValorFase1 {
  dados: Fase1Dados;
  carga: EstadoCarga;
  tentarDeNovo: () => void;
  sair: () => void;
  celebracaoAtual: Celebracao | null;
  fecharCelebracao: () => void;
  celebrar: (c: Celebracao) => void;
  /** Só no provedor de demonstração: o app real NUNCA simula venda. */
  simularMissao?: (m: Missao) => void;
  /** Elemento extra no topo (ex.: seletor de cenário da demonstração). */
  extraTopo?: ReactNode;
}

export const ContextoFase1 = createContext<ValorFase1 | null>(null);

export function useFase1(): ValorFase1 {
  const ctx = useContext(ContextoFase1);
  if (!ctx) throw new Error('useFase1 precisa estar dentro de um provedor da Fase 1');
  return ctx;
}
