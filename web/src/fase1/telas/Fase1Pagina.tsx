import { ReactNode } from 'react';
import { useCargaSimulada, useFase1 } from '../demo/Fase1Contexto';
import { Carregando, Erro } from '../componentes/ui';

/** Envelope de toda tela da Fase 1: aplica loading/erro do cenário antes de renderizar. */
export function Fase1Pagina({ children, carregando }: { children: ReactNode; carregando: string }) {
  const estado = useCargaSimulada();
  const { tentarDeNovo } = useFase1();
  if (estado === 'carregando') return <Carregando texto={carregando} />;
  if (estado === 'erro') return <Erro onTentar={tentarDeNovo} />;
  return <div className="flex flex-col gap-4">{children}</div>;
}
