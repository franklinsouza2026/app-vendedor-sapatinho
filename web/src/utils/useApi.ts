import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/client';

interface EstadoApi<T> {
  dados: T | null;
  carregando: boolean;
  erro: string | null;
  atualizadoEm: Date | null;
  recarregar: () => void;
}

/** Orquestra um fetch com loading/erro/refetch — usado em toda tela que consome a API. */
export function useApi<T>(fn: () => Promise<T>, deps: unknown[] = []): EstadoApi<T> {
  const [dados, setDados] = useState<T | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);
  const versao = useRef(0);

  const carregar = useCallback(() => {
    const minhaVersao = ++versao.current;
    setCarregando(true);
    setErro(null);
    fn()
      .then((res) => {
        if (versao.current !== minhaVersao) return; // resposta obsoleta (nova chamada já disparada)
        setDados(res);
        setAtualizadoEm(new Date());
      })
      .catch((err) => {
        if (versao.current !== minhaVersao) return;
        if (err instanceof ApiError && err.status === 401) return; // AuthContext já trata (redireciona pro login)
        setErro('Não foi possível carregar os dados agora.');
      })
      .finally(() => {
        if (versao.current === minhaVersao) setCarregando(false);
      });
    // deps é controlado pelo chamador (ex.: [] pra buscar 1x, [periodo] pra refazer quando mudar)
  }, deps);

  useEffect(() => {
    carregar();
  }, [carregar]);

  return { dados, carregando, erro, atualizadoEm, recarregar: carregar };
}
