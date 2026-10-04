/**
 * Provedor REAL do app da vendedora: os dados vêm INTEIROS do servidor
 * (GET /app/painel). Nada é calculado aqui que decida posição, prêmio ou
 * recompensa. Atualiza ao abrir, ao voltar para o app e a cada 2 minutos
 * com o app visível (o ERP sincroniza a cada ~15 min).
 *
 * Celebrações: o servidor diz o que aconteceu (créditos recentes do ledger);
 * este provedor só lembra, por vendedora, quais já foram mostradas — estado
 * de interface, não dado de negócio.
 */
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { ContextoFase1, EstadoCarga } from '../contexto';
import type { Celebracao, Fase1Dados } from '../dominio/tipos';
import { Carregando, Erro } from '../componentes/ui';

const ATUALIZAR_A_CADA_MS = 2 * 60 * 1000;

function chaveCelebrado(vendedorId: string) {
  return `vendedor-ia:celebrado:${vendedorId}`;
}

function lerCelebrados(vendedorId: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(chaveCelebrado(vendedorId)) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

function gravarCelebrado(vendedorId: string, id: string) {
  try {
    const atuais = [...lerCelebrados(vendedorId), id].slice(-100);
    localStorage.setItem(chaveCelebrado(vendedorId), JSON.stringify(atuais));
  } catch {
    // sem storage, a celebração pode repetir — nunca afeta dado
  }
}

export function ProvedorVendedor({ children }: { children: ReactNode }) {
  const { logout } = useAuth();
  const navegar = useNavigate();
  const [dados, setDados] = useState<Fase1Dados | null>(null);
  const [carga, setCarga] = useState<EstadoCarga>('carregando');
  const [fila, setFila] = useState<Celebracao[]>([]);
  const emAndamento = useRef(false);

  const carregar = useCallback(async (silencioso: boolean) => {
    if (emAndamento.current) return;
    emAndamento.current = true;
    if (!silencioso) setCarga('carregando');
    try {
      const novo = await apiFetch<Fase1Dados>('/app/painel');
      setDados(novo);
      setCarga('pronto');
      const vistos = lerCelebrados(novo.vendedor.id);
      setFila((atual) => [...atual, ...novo.celebracoes.filter((c) => !vistos.has(c.id) && !atual.some((a) => a.id === c.id))]);
    } catch {
      // Atualização silenciosa que falha mantém os últimos dados na tela.
      if (!silencioso) setCarga('erro');
    } finally {
      emAndamento.current = false;
    }
  }, []);

  useEffect(() => {
    void carregar(false);
    const intervalo = setInterval(() => {
      if (document.visibilityState === 'visible') void carregar(true);
    }, ATUALIZAR_A_CADA_MS);
    const aoVoltar = () => {
      if (document.visibilityState === 'visible') void carregar(true);
    };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => {
      clearInterval(intervalo);
      document.removeEventListener('visibilitychange', aoVoltar);
    };
  }, [carregar]);

  const valor = useMemo(
    () =>
      dados && {
        dados,
        carga,
        tentarDeNovo: () => void carregar(false),
        sair: () => {
          void logout().then(() => navegar('/login', { replace: true }));
        },
        celebracaoAtual: fila[0] ?? null,
        fecharCelebracao: () => {
          if (fila[0]) gravarCelebrado(dados.vendedor.id, fila[0].id);
          setFila((f) => f.slice(1));
        },
        celebrar: (c: Celebracao) => setFila((f) => [...f, c]),
      },
    [dados, carga, fila, carregar, logout, navegar]
  );

  if (!valor) {
    if (carga === 'erro') return <div className="fase1 min-h-full bg-base p-6"><Erro onTentar={() => void carregar(false)} /></div>;
    return <div className="fase1 min-h-full bg-base p-6"><Carregando texto="Buscando seus números..." /></div>;
  }
  return <ContextoFase1.Provider value={valor}>{children}</ContextoFase1.Provider>;
}
