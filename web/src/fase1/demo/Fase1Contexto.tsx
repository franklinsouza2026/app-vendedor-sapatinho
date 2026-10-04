/**
 * Estado da demonstração:
 *  - perfil escolhido na entrada (vendedor/admin) e modo "pré-visualização do Admin";
 *  - cenário ativo e fila de celebrações;
 *  - ESTADO DO ADMIN (persistente): o que o Admin configura chega à vendedora.
 *
 * Nada aqui conversa com a API nem com o AuthContext real.
 */
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Celebracao, Fase1Dados } from '../dominio/tipos';
import { buscarCenario, CENARIO_PADRAO, type Cenario, montarCenario } from './cenarios';
import { AGORA_DEMO, carregarEstado, type EstadoDemo, estadoInicial, limparEstadoSalvo, novoId, salvarEstado } from './estado';

export type PerfilDemo = 'VENDEDOR' | 'ADMIN';

export interface RegistroAuditoria {
  acao: string;
  entidade: string;
  antes?: string | null;
  depois?: string | null;
  motivo?: string | null;
}

interface Fase1ContextoValor {
  perfil: PerfilDemo | null;
  entrar: (perfil: PerfilDemo) => void;
  sair: () => void;
  /** Admin abrindo o app da vendedora para conferir o que configurou. */
  previewAdmin: boolean;
  verComoVendedor: () => void;
  voltarAoAdmin: () => void;
  cenario: Cenario;
  trocarCenario: (id: string) => void;
  dados: Fase1Dados;
  estado: EstadoDemo;
  /** Toda alteração do Admin passa por aqui: aplica, registra na auditoria e persiste. */
  alterar: (mutacao: (e: EstadoDemo) => void, registro: RegistroAuditoria | null) => void;
  restaurarDemo: () => void;
  celebracaoAtual: Celebracao | null;
  celebrar: (c: Celebracao) => void;
  fecharCelebracao: () => void;
  versaoCarga: number;
  tentarDeNovo: () => void;
}

const Contexto = createContext<Fase1ContextoValor | null>(null);

const CHAVE_PERFIL = 'vendedor-ia:fase1:perfil';
const CHAVE_PREVIEW = 'vendedor-ia:fase1:preview';
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
  const [previewAdmin, setPreviewAdmin] = useState(() => ler(CHAVE_PREVIEW) === '1');
  const [cenarioId, setCenarioId] = useState(cenarioInicial);
  const [estado, setEstado] = useState<EstadoDemo>(carregarEstado);
  const [fila, setFila] = useState<Celebracao[]>([]);
  const [versaoCarga, setVersaoCarga] = useState(0);

  const cenario = buscarCenario(cenarioId);
  const dados = useMemo(() => montarCenario(cenario.id, estado), [cenario.id, estado]);

  const trocarCenario = useCallback((id: string) => {
    gravar(CHAVE_CENARIO, id);
    gravar(`${CHAVE_CELEBRADO}:${id}`, null); // escolher o cenário de novo = rever a celebração
    setCenarioId(id);
    setVersaoCarga((v) => v + 1);
  }, []);

  // Celebrações do cenário entram na fila uma vez por seleção — recarregar não repete.
  useEffect(() => {
    // Usa o estado do Admin vigente: o texto da celebração reflete a meta configurada.
    setFila(ler(`${CHAVE_CELEBRADO}:${cenario.id}`) ? [] : montarCenario(cenario.id, estado).celebracoes);
  }, [cenario.id, versaoCarga]);

  const alterar = useCallback((mutacao: (e: EstadoDemo) => void, registro: RegistroAuditoria | null) => {
    setEstado((atual) => {
      const novo = structuredClone(atual);
      mutacao(novo);
      if (registro) {
        novo.auditoria.unshift({ id: novoId('aud'), quando: AGORA_DEMO, usuario: 'admin@sapatinho', acao: registro.acao, entidade: registro.entidade, antes: registro.antes ?? null, depois: registro.depois ?? null, motivo: registro.motivo ?? null });
      }
      salvarEstado(novo);
      return novo;
    });
  }, []);

  const valor: Fase1ContextoValor = {
    perfil,
    entrar: (p) => {
      gravar(CHAVE_PERFIL, p);
      gravar(CHAVE_PREVIEW, null);
      setPreviewAdmin(false);
      setPerfil(p);
    },
    sair: () => {
      gravar(CHAVE_PERFIL, null);
      gravar(CHAVE_PREVIEW, null);
      setPreviewAdmin(false);
      setPerfil(null);
    },
    previewAdmin,
    verComoVendedor: () => {
      gravar(CHAVE_PERFIL, 'VENDEDOR');
      gravar(CHAVE_PREVIEW, '1');
      setPreviewAdmin(true);
      setPerfil('VENDEDOR');
    },
    voltarAoAdmin: () => {
      gravar(CHAVE_PERFIL, 'ADMIN');
      gravar(CHAVE_PREVIEW, null);
      setPreviewAdmin(false);
      setPerfil('ADMIN');
    },
    cenario,
    trocarCenario,
    dados,
    estado,
    alterar,
    restaurarDemo: () => {
      limparEstadoSalvo();
      setEstado(estadoInicial());
    },
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
