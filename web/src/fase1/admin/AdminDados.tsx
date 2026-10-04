/**
 * Dados da central do Admin: o estado REAL vem do servidor; cada ação chama a
 * API e, ao terminar, recarrega o estado — o que a tela mostra é sempre o que
 * está no banco (nunca uma cópia local editada).
 */
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { ApiError } from '../../api/client';
import { Carregando, Erro } from '../componentes/ui';
import { buscarEstado } from './api';
import type { EstadoAdmin } from './tiposAdmin';

interface ValorAdmin {
  estado: EstadoAdmin;
  recarregar: () => Promise<void>;
  /** Executa uma ação de API; devolve a mensagem de erro amigável, ou null se deu certo (e recarrega). */
  executar: (acao: () => Promise<unknown>) => Promise<string | null>;
}

const Contexto = createContext<ValorAdmin | null>(null);

export function mensagemDeErro(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return 'Sem permissão para esta ação.';
    if (err.status === 404) return 'Registro não encontrado (pode ter sido alterado por outra pessoa).';
    if (err.status === 409 || err.status === 400) return err.message || 'Não foi possível salvar — confira os dados.';
    if (err.status === 503) return err.message || 'Serviço temporariamente indisponível.';
  }
  return 'Não foi possível concluir agora. Tente de novo.';
}

export function ProvedorAdmin({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<EstadoAdmin | null>(null);
  const [erro, setErro] = useState(false);

  const recarregar = useCallback(async () => {
    try {
      setEstado(await buscarEstado());
      setErro(false);
    } catch {
      setErro(true);
    }
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const executar = useCallback(
    async (acao: () => Promise<unknown>) => {
      try {
        await acao();
        await recarregar();
        return null;
      } catch (err) {
        await recarregar();
        return mensagemDeErro(err);
      }
    },
    [recarregar]
  );

  if (!estado) {
    return <div className="fase1 min-h-full bg-base p-6">{erro ? <Erro onTentar={() => void recarregar()} /> : <Carregando texto="Abrindo a central de comando..." />}</div>;
  }
  return <Contexto.Provider value={{ estado, recarregar, executar }}>{children}</Contexto.Provider>;
}

export function useAdmin() {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error('useAdmin precisa estar dentro de <ProvedorAdmin>');
  return ctx;
}
