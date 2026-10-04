import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { buscarSessaoAtual, login as apiLogin } from '../api/auth';
import { ApiError, getToken, limparToken, registrarHandlerSessaoExpirada, setToken } from '../api/client';
import { SessaoAtual } from '../types';

interface AuthContextValue {
  sessao: SessaoAtual | null;
  carregando: boolean;
  erroSessao: string | null;
  /** Há sessão salva mas o servidor não pôde ser alcançado (sem internet). A sessão NÃO é descartada. */
  semConexao: boolean;
  tentarDeNovo: () => void;
  login: (lojaId: string, matriculaErp: string, senha: string) => Promise<void>;
  adotarToken: (token: string) => Promise<void>;
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
  const [semConexao, setSemConexao] = useState(false);

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

  const reidratar = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setCarregando(false);
      return;
    }
    try {
      const atual = await buscarSessaoAtual();
      setSessao(atual);
      setSemConexao(false);
    } catch (err) {
      // Só o SERVIDOR invalida a sessão (401/403). Falha de rede (abrir o app
      // sem internet) não pode deslogar ninguém: a sessão fica guardada e o app
      // avisa que está sem conexão até a rede voltar.
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) limparToken();
      else setSemConexao(true);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void reidratar();
  }, [reidratar]);

  // Rede voltou: retoma a sessão sozinho (no evento `online` e, como o evento
  // pode chegar antes de a rede responder, também a cada 10 s enquanto offline).
  useEffect(() => {
    if (!semConexao) return;
    const aoVoltar = () => void reidratar();
    window.addEventListener('online', aoVoltar);
    const intervalo = setInterval(aoVoltar, 10_000);
    return () => {
      window.removeEventListener('online', aoVoltar);
      clearInterval(intervalo);
    };
  }, [semConexao, reidratar]);

  async function login(lojaId: string, matriculaErp: string, senha: string) {
    setErroSessao(null);
    const { token } = await apiLogin(lojaId, matriculaErp, senha);
    setToken(token);
    const atual = await buscarSessaoAtual();
    setSessao(atual);
  }

  // Adota um token já emitido (ex.: resposta de POST /auth/ativacao, que loga
  // o vendedor automaticamente após ativar a conta) sem passar pelo fluxo de
  // /auth/login de novo.
  async function adotarToken(token: string) {
    setErroSessao(null);
    setToken(token);
    const atual = await buscarSessaoAtual();
    setSessao(atual);
  }

  return (
    <AuthContext.Provider value={{ sessao, carregando, erroSessao, semConexao, tentarDeNovo: () => void reidratar(), login, adotarToken, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>');
  return ctx;
}
