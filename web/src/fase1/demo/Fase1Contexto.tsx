/**
 * Provedor de DEMONSTRAÇÃO das telas da vendedora — usado SOMENTE em testes
 * de interface (cenários fixos A…X). Implementa o mesmo contrato do provedor
 * real (`ContextoFase1`) e nunca é importado pelo app de produção.
 *
 * O "mundo demo" (estado.ts) é uma fixture: não fala com a API.
 */
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ContextoFase1, type ValorFase1 } from '../contexto';
import type { Celebracao, Missao } from '../dominio/tipos';
import { buscarCenario, CENARIO_PADRAO, type Cenario, montarCenario } from './cenarios';
import { type EstadoDemo, estadoInicial } from './estado';
import { SeletorCenario } from './SeletorCenario';

interface ValorDemo {
  cenario: Cenario;
  trocarCenario: (id: string) => void;
  celebrar: (c: Celebracao) => void;
}

const ContextoDemo = createContext<ValorDemo | null>(null);

export function useDemo(): ValorDemo {
  const ctx = useContext(ContextoDemo);
  if (!ctx) throw new Error('useDemo precisa estar dentro de <ProvedorDemoVendedor>');
  return ctx;
}

const CHAVE_CELEBRADO = 'vendedor-ia:demo:celebrado';

function jaCelebrado(id: string): boolean {
  try {
    return sessionStorage.getItem(`${CHAVE_CELEBRADO}:${id}`) === '1';
  } catch {
    return false;
  }
}

export function ProvedorDemoVendedor({ cenarioInicial = CENARIO_PADRAO, children }: { cenarioInicial?: string; children: ReactNode }) {
  const [cenarioId, setCenarioId] = useState(cenarioInicial.toUpperCase());
  const [estado, setEstado] = useState<EstadoDemo>(estadoInicial);
  const [fila, setFila] = useState<Celebracao[]>([]);
  const [versaoCarga, setVersaoCarga] = useState(0);
  const [carga, setCarga] = useState<ValorFase1['carga']>('pronto');

  const cenario = buscarCenario(cenarioId);
  const dados = useMemo(() => montarCenario(cenario.id, estado), [cenario.id, estado]);

  useEffect(() => {
    setFila(jaCelebrado(cenario.id) ? [] : montarCenario(cenario.id, estado).celebracoes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cenario.id, versaoCarga]);

  // Ciclo de carga simulado (normal, lento, erro) conforme o cenário.
  useEffect(() => {
    if (cenario.carga === 'normal') return setCarga('pronto');
    setCarga('carregando');
    const t = setTimeout(() => setCarga(cenario.carga === 'erro' ? 'erro' : 'pronto'), cenario.carga === 'erro' ? 900 : 2500);
    return () => clearTimeout(t);
  }, [cenario.carga, versaoCarga]);

  const celebrar = useCallback((c: Celebracao) => setFila((f) => [...f, c]), []);
  const trocarCenario = useCallback((id: string) => {
    try {
      sessionStorage.removeItem(`${CHAVE_CELEBRADO}:${id}`);
    } catch {
      // ignora
    }
    setCenarioId(id);
    setVersaoCarga((v) => v + 1);
  }, []);

  /** "Simular venda": progresso e crédito como lançamentos do ledger simulado. */
  const simularMissao = useCallback(
    (m: Missao) => {
      const chave = `${cenario.id}:${m.id}`;
      const conclui = m.progresso + 1 >= m.alvo;
      setEstado((atual) => {
        const novo = structuredClone(atual);
        novo.simulacao.progresso[chave] = (novo.simulacao.progresso[chave] ?? 0) + 1;
        if (conclui) novo.simulacao.creditos.unshift({ id: `${chave}:${novo.simulacao.creditos.length + 1}`, quando: dados.agora, origem: `Missão “${m.titulo}”`, xp: m.recompensa.xp, moedas: m.recompensa.moedas });
        return novo;
      });
      if (conclui) celebrar({ id: `sim-${chave}`, tipo: 'MISSAO', titulo: 'Missão concluída!', detalhe: `${m.titulo} — objetivo atingido.`, recompensa: m.recompensa });
    },
    [cenario.id, dados.agora, celebrar]
  );

  const demo: ValorDemo = { cenario, trocarCenario, celebrar };
  const valor: ValorFase1 = {
    dados,
    carga,
    tentarDeNovo: () => setVersaoCarga((v) => v + 1),
    sair: () => undefined,
    celebracaoAtual: fila[0] ?? null,
    fecharCelebracao: () => {
      try {
        sessionStorage.setItem(`${CHAVE_CELEBRADO}:${cenario.id}`, '1');
      } catch {
        // ignora
      }
      setFila((f) => f.slice(1));
    },
    celebrar,
    simularMissao,
    extraTopo: <SeletorCenario />,
  };

  return (
    <ContextoDemo.Provider value={demo}>
      <ContextoFase1.Provider value={valor}>{children}</ContextoFase1.Provider>
    </ContextoDemo.Provider>
  );
}
