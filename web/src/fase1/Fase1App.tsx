/**
 * Rotas do app real da Fase 1 — Performance & Game.
 *
 *   /login, /ativacao        entrada (real: senha, token de ativação)
 *   /inicio … /perfil        app da vendedora (papel VENDEDOR)
 *   /admin/*                 central do Admin (papel ADMIN, chunk separado)
 *   /sem-acesso              outros papéis: fora do piloto
 *
 * Papel é sempre revalidado no backend; o RequireAuth só evita mostrar a tela.
 */
import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth } from '../auth/RequireAuth';
import { useAuth } from '../auth/AuthContext';
import { rotaInicialPara } from '../auth/rotaInicial';
import { LoadingState } from '../components/LoadingState';
import { Login } from '../screens/Login';
import { Ativacao } from '../screens/Ativacao';
import { AlterarSenha } from '../screens/AlterarSenha';
import './fase1.css';
import { Fase1Layout } from './Fase1Layout';
import { ProvedorVendedor } from './real/ProvedorVendedor';
import { Inicio } from './telas/Inicio';
import { Desempenho } from './telas/Desempenho';
import { Ranking } from './telas/Ranking';
import { Desafios, DetalheCompeticao, DetalheMissao } from './telas/Desafios';
import { Progresso } from './telas/Progresso';
import { Moedas } from './telas/Moedas';
import { Conquistas } from './telas/Conquistas';
import { Recordes } from './telas/Recordes';
import { Feed } from './telas/Feed';
import { PaginaReconhecimentos, Perfil } from './telas/Perfil';

const AdminRotas = lazy(() => import('./admin/AdminRotas'));

function Raiz() {
  const { sessao, carregando } = useAuth();
  if (carregando) return <LoadingState texto="Carregando sua sessão..." />;
  if (!sessao) return <Navigate to="/login" replace />;
  return <Navigate to={rotaInicialPara(sessao.vendedor.papel)} replace />;
}

function SemAcesso() {
  const { logout } = useAuth();
  return (
    <div className="fase1 mx-auto flex min-h-full w-full max-w-md flex-col justify-center gap-4 px-6 py-12">
      <h1 className="text-2xl font-bold text-white">Seu perfil ainda não faz parte do piloto</h1>
      <p className="text-slate-300">Nesta fase o app atende vendedoras e a administração. Fale com o Admin da sua empresa.</p>
      <button onClick={() => void logout()} className="min-h-[48px] rounded-full border border-slate-700 font-medium text-slate-300">
        Sair
      </button>
    </div>
  );
}

/** Telas da vendedora — as mesmas com o provedor real e nos testes de interface. */
export function rotasDaVendedora() {
  return (
    <>
      <Route path="/inicio" element={<Inicio />} />
      <Route path="/desempenho" element={<Desempenho />} />
      <Route path="/ranking" element={<Ranking />} />
      <Route path="/desafios" element={<Desafios />} />
      <Route path="/desafios/missao/:id" element={<DetalheMissao />} />
      <Route path="/desafios/competicao/:id" element={<DetalheCompeticao />} />
      <Route path="/progresso" element={<Progresso />} />
      <Route path="/moedas" element={<Moedas />} />
      <Route path="/conquistas" element={<Conquistas />} />
      <Route path="/recordes" element={<Recordes />} />
      <Route path="/feed" element={<Feed />} />
      <Route path="/reconhecimentos" element={<PaginaReconhecimentos />} />
      <Route path="/perfil" element={<Perfil />} />
      <Route path="/perfil/senha" element={<AlterarSenha />} />
    </>
  );
}

export function RotasFase1() {
  return (
    <Routes>
      <Route path="/" element={<Raiz />} />
      <Route path="/login" element={<Login />} />
      <Route path="/ativacao" element={<Ativacao />} />
      <Route path="/sem-acesso" element={<SemAcesso />} />
      <Route
        path="/admin/*"
        element={
          <RequireAuth papeis={['ADMIN']}>
            <Suspense fallback={<LoadingState texto="Abrindo a central de comando..." />}>
              <AdminRotas />
            </Suspense>
          </RequireAuth>
        }
      />
      <Route
        element={
          <RequireAuth papeis={['VENDEDOR']}>
            <ProvedorVendedor>
              <Fase1Layout />
            </ProvedorVendedor>
          </RequireAuth>
        }
      >
        {rotasDaVendedora()}
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default RotasFase1;
