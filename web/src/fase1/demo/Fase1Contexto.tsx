/**
 * Estado da demonstração: perfil escolhido na entrada (vendedor/admin),
 * cenário ativo e fila de celebrações. Fica em sessionStorage — fecha a aba,
 * volta ao começo. Nada aqui conversa com a API nem com o AuthContext real.
 */
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Celebracao, Fase1Dados } from '../dominio/tipos';
import { buscarCenario, CENARIO_PADRAO, type Cenario, montarCenario } from './cenarios';

export type PerfilDemo = 'VENDEDOR' | 'ADMIN';

interface Fase1ContextoValor {
  perfil: PerfilDemo | null;
  entrar: (perfil: PerfilDemo) => void;
  sair: () => void;
  cenario: Cenario;
  trocarCenario: (id: string) => void;
  dados: Fase1Dados;
  celebracaoAtual: Celebracao | null;
  celebrar: (c: Celebracao) => void;
  fecharCelebracao: () => void;
  /** Incrementa a cada troca de cenário/tentativa — usado pelas telas para refazer a "carga". */
  versaoCarga: number;
  tentarDeNovo: () => void;
}

const Contexto = createContext<Fase1ContextoValor | null>(null);

const CHAVE_PERFIL = 'vendedor-ia:fase1:perfil';
const CHAVE_CENARIO = 'vendedor-ia:fase1:cenario';
const CHAVE_CELEBRADO = 'vendedor-ia:fase1:celebrado';

function ler(chave: string): string | null {
  try {
    return sessionStorage.getItem(chave);
  } catch {
    return null;
  }
}

function gravar(chave: string, valor: string | null) {
  try {
    if (valor === null) sessionStorage.removeItem(chave);
    else sessionStorage.setItem(chave, valor);
  } catch {
    // sem storage a demo funciona igual, só não lembra entre recarregamentos
  }
}

function cenarioInicial(): string {
  const daUrl = new URLSearchParams(window.location.search).get('cenario');
  return (daUrl ?? ler(CHAVE_CENARIO) ?? CENARIO_PADRAO).toUpperCase();
}

export function Fase1Provider({ children }: { children: ReactNode }) {
  const [perfil, setPerfil] = useState<PerfilDemo | null>(() => {
    const p = ler(CHAVE_PERFIL);
    return p === 'VENDEDOR' || p === 'ADMIN' ? p : null;
  });
  const [cenarioId, setCenarioId] = useState(cenarioInicial);
  const [fila, setFila] = useState<Celebracao[]>([]);
  const [versaoCarga, setVersaoCarga] = useState(0);

  const cenario = buscarCenario(cenarioId);
  const dados = useMemo(() => montarCenario(cenario.id), [cenario.id]);

  const trocarCenario = useCallback((id: string) => {
    gravar(CHAVE_CENARIO, id);
    gravar(`${CHAVE_CELEBRADO}:${id}`, null); // escolher o cenário de novo = rever a celebração
    setCenarioId(id);
    setVersaoCarga((v) => v + 1);
  }, []);

  // As celebrações do cenário entram na fila quando ele é aberto — uma vez por
  // seleção: recarregar a página não repete a festa.
  useEffect(() => {
    setFila(ler(`${CHAVE_CELEBRADO}:${cenario.id}`) ? [] : dados.celebracoes);
  }, [dados, cenario.id, versaoCarga]);

  const valor: Fase1ContextoValor = {
    perfil,
    entrar: (p) => {
      gravar(CHAVE_PERFIL, p);
      setPerfil(p);
    },
    sair: () => {
      gravar(CHAVE_PERFIL, null);
      setPerfil(null);
    },
    cenario,
    trocarCenario,
    dados,
    celebracaoAtual: fila[0] ?? null,
    celebrar: (c) => setFila((f) => [...f, c]),
    fecharCelebracao: () => {
      gravar(`${CHAVE_CELEBRADO}:${cenario.id}`, '1');
      setFila((f) => f.slice(1));
    },
    versaoCarga,
    tentarDeNovo: () => setVersaoCarga((v) => v + 1),
  };

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useFase1() {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error('useFase1 precisa estar dentro de <Fase1Provider>');
  return ctx;
}

/**
 * Simula o ciclo de carga de uma tela conforme o cenário (normal, lento, erro).
 * Quando a API real entrar, este hook vira o `useApi` de sempre.
 */
export function useCargaSimulada(): 'carregando' | 'erro' | 'pronto' {
  const { cenario, versaoCarga } = useFase1();
  const [estado, setEstado] = useState<'carregando' | 'erro' | 'pronto'>(cenario.carga === 'normal' ? 'pronto' : 'carregando');

  useEffect(() => {
    if (cenario.carga === 'normal') {
      setEstado('pronto');
      return;
    }
    setEstado('carregando');
    const t = setTimeout(() => setEstado(cenario.carga === 'erro' ? 'erro' : 'pronto'), cenario.carga === 'erro' ? 900 : 2500);
    return () => clearTimeout(t);
  }, [cenario.carga, versaoCarga]);

  return estado;
}
