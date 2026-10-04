import { ReactNode } from 'react';
import { useFase1 } from '../contexto';
import { Carregando, Erro } from '../componentes/ui';

/** Envelope de toda tela da Fase 1: aplica loading/erro da carga antes de renderizar. */
export function Fase1Pagina({ children, carregando }: { children: ReactNode; carregando: string }) {
  const { carga, tentarDeNovo } = useFase1();
  if (carga === 'carregando') return <Carregando texto={carregando} />;
  if (carga === 'erro') return <Erro onTentar={tentarDeNovo} />;
  return <div className="flex flex-col gap-4">{children}</div>;
}
