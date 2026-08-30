import { ReactNode } from 'react';

/**
 * Container de página — resolve o achado CRÍTICO da auditoria (nenhuma tela
 * tinha largura máxima: inputs/botões/bolhas de chat esticavam até a borda
 * da janela em qualquer viewport acima de ~450px, inclusive desktop).
 * Mobile-first: em telas estreitas ocupa 100%; a partir de ~448px centraliza
 * com uma largura de "app", nunca "site esticado".
 */
export function Screen({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-md ${className}`}>{children}</div>;
}
