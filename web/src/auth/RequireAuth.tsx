import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { ReactNode } from 'react';
import { LoadingState } from '../components/LoadingState';
import { Papel } from '../types';

export function RequireAuth({ children, papeis }: { children: ReactNode; papeis?: Papel[] }) {
  const { sessao, carregando } = useAuth();

  if (carregando) return <LoadingState texto="Carregando sua sessão..." />;
  if (!sessao) return <Navigate to="/login" replace />;
  // Papel também é validado sempre no backend (deny-by-default) — este check
  // aqui só evita mostrar a tela e navegação do Admin pra quem não tem acesso.
  if (papeis && !papeis.includes(sessao.vendedor.papel)) return <Navigate to="/" replace />;

  return <>{children}</>;
}
