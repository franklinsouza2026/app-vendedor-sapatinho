import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { buscarSessaoAtual, login as apiLogin } from '../api/auth';
import { getToken, limparToken, registrarHandlerSessaoExpirada, setToken } from '../api/client';
import { SessaoAtual } from '../types';

interface AuthContextValue {
  sessao: SessaoAtual | null;
  carregando: boolean;
  erroSessao: string | null;
  login: (codigoErpLoja: string, matriculaErp: string, senha: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Apaga qualquer cache do browser (Cache Storage do service worker) — nunca
 * deixar dado em cache sobreviver ao logout, mesmo que hoje a API não seja
 * cacheada por design (defesa em profundidade). */
async function limparCachesDoBrowser() {
  if (typeof caches === 'undefined') return;
  const nomes = await caches.keys();
  await Promise.all(nomes.map((nome) => caches.delete(nome)));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<SessaoAtual | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erroSessao, setErroSessao] = useState<string | null>(null);

  const logout = useCallback(async () => {
    limparToken();
    await limparCachesDoBrowser();
    setSessao(null);
  }, []);

  useEffect(() => {
    registrarHandlerSessaoExpirada(() => {
      setSessao(null);
      setErroSessao('Sua sessão expirou. Entre novamente.');
    });
  }, []);

  useEffect(() => {
    async function reidratar() {
      const token = getToken();
      if (!token) {
        setCarregando(false);
        return;
      }
      try {
        const atual = await buscarSessaoAtual();
        setSessao(atual);
      } catch {
        limparToken();
      } finally {
        setCarregando(false);
      }
    }
    reidratar();
  }, []);

  async function login(codigoErpLoja: string, matriculaErp: string, senha: string) {
    setErroSessao(null);
    const { token } = await apiLogin(codigoErpLoja, matriculaErp, senha);
    setToken(token);
    const atual = await buscarSessaoAtual();
    setSessao(atual);
  }

  return (
    <AuthContext.Provider value={{ sessao, carregando, erroSessao, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>');
  return ctx;
}
