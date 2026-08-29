import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { ReactNode } from 'react';
import { LoadingState } from '../components/LoadingState';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { sessao, carregando } = useAuth();

  if (carregando) return <LoadingState texto="Carregando sua sessão..." />;
  if (!sessao) return <Navigate to="/login" replace />;

  return <>{children}</>;
}
