const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const TOKEN_KEY = 'vendedor-ia:token';

// Callback registrado pelo AuthContext — chamado sempre que qualquer request
// recebe 401 (token ausente/expirado/inválido), pra deslogar e redirecionar
// sem cada tela precisar tratar isso individualmente.
let onSessaoExpirada: (() => void) | null = null;
export function registrarHandlerSessaoExpirada(fn: () => void) {
  onSessaoExpirada = fn;
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null; // localStorage pode não estar disponível (modo privado restrito)
  }
}

export function setToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // silencioso — sem storage, a sessão simplesmente não persiste entre reloads
  }
}

export function limparToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ver getToken
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public type?: string
  ) {
    super(message);
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const resp = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (resp.status === 401) {
    limparToken();
    onSessaoExpirada?.();
    throw new ApiError(401, 'sessão expirada');
  }

  if (!resp.ok) {
    const corpo = await resp.json().catch(() => ({ error: 'erro inesperado' }));
    throw new ApiError(resp.status, corpo.error ?? 'erro inesperado', corpo.type);
  }

  return resp.json();
}
