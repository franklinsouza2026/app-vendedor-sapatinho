import { lazy, Suspense } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { CheckinProvider } from './engajamento/CheckinContext';
import { LoadingState } from './components/LoadingState';
import { RotasFase1 } from './fase1/Fase1App';

// O app é a Fase 1 — Performance & Game (experiência homologada, dados reais).
// O app anterior só existe com VITE_MODULOS_LEGADOS=true: a condição usa
// `import.meta.env` direto para o Vite descartar o chunk no build do piloto.
const RotasLegado = import.meta.env.VITE_MODULOS_LEGADOS === 'true' ? lazy(() => import('./legado/RotasLegado')) : null;

export function App() {
  return (
    <AuthProvider>
      <CheckinProvider>
        <BrowserRouter>
          {RotasLegado ? (
            <Suspense fallback={<LoadingState texto="Carregando..." />}>
              <RotasLegado />
            </Suspense>
          ) : (
            <RotasFase1 />
          )}
        </BrowserRouter>
      </CheckinProvider>
    </AuthProvider>
  );
}
