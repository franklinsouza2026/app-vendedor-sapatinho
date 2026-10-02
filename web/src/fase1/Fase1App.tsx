/**
 * Raiz da demonstração da Fase 1 (chunk lazy). Montada em `/fase1/*` pelo
 * App.tsx apenas quando a flag de demonstração está ativa.
 */
import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { LoadingState } from '../components/LoadingState';
import './fase1.css';
import { Fase1Provider } from './demo/Fase1Contexto';
import { Fase1Layout } from './Fase1Layout';
import { Entrar } from './telas/Entrar';
import { Inicio } from './telas/Inicio';
import { Desempenho } from './telas/Desempenho';
import { Ranking } from './telas/Ranking';
import { Desafios } from './telas/Desafios';
import { Progresso } from './telas/Progresso';
import { Moedas } from './telas/Moedas';
import { Conquistas } from './telas/Conquistas';
import { Recordes } from './telas/Recordes';
import { Feed } from './telas/Feed';
import { PaginaReconhecimentos, Perfil } from './telas/Perfil';

const AdminRotas = lazy(() => import('./admin/AdminRotas'));

export default function Fase1App() {
  return (
    <Fase1Provider>
      <Routes>
        <Route index element={<Entrar />} />
        <Route
          path="admin/*"
          element={
            <Suspense fallback={<LoadingState texto="Abrindo a central de comando..." />}>
              <AdminRotas />
            </Suspense>
          }
        />
        <Route element={<Fase1Layout />}>
          <Route path="inicio" element={<Inicio />} />
          <Route path="desempenho" element={<Desempenho />} />
          <Route path="ranking" element={<Ranking />} />
          <Route path="desafios" element={<Desafios />} />
          <Route path="progresso" element={<Progresso />} />
          <Route path="moedas" element={<Moedas />} />
          <Route path="conquistas" element={<Conquistas />} />
          <Route path="recordes" element={<Recordes />} />
          <Route path="feed" element={<Feed />} />
          <Route path="reconhecimentos" element={<PaginaReconhecimentos />} />
          <Route path="perfil" element={<Perfil />} />
        </Route>
        <Route path="*" element={<Navigate to="/fase1" replace />} />
      </Routes>
    </Fase1Provider>
  );
}
