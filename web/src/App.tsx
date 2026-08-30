import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { RequireAuth } from './auth/RequireAuth';
import { Layout } from './components/Layout';
import { Login } from './screens/Login';
import { Home } from './screens/Home';
import { Metas } from './screens/Metas';
import { Ranking } from './screens/Ranking';
import { Carteira } from './screens/Carteira';
import { Badges } from './screens/Badges';
import { Perfil } from './screens/Perfil';
import { Coach } from './screens/Coach';
import { Treinador } from './screens/Treinador';
import { Simulador } from './screens/Simulador';
import { Academia } from './screens/Academia';

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          {/* Coach fica fora do Layout (sem bottom nav) — tela de chat ocupa a
              altura inteira, com input fixo embaixo; bottom nav junto quebraria
              esse layout. */}
          <Route
            path="/coach"
            element={
              <RequireAuth>
                <Coach />
              </RequireAuth>
            }
          />
          <Route
            path="/treinador"
            element={
              <RequireAuth>
                <Treinador />
              </RequireAuth>
            }
          />
          {/* Simulador também fica fora do Layout — mesma razão do Coach/Treinador:
              a tela de sessão ocupa a altura inteira, com input fixo embaixo. */}
          <Route
            path="/simulador"
            element={
              <RequireAuth>
                <Simulador />
              </RequireAuth>
            }
          />
          <Route
            element={
              <RequireAuth>
                <Layout />
              </RequireAuth>
            }
          >
            <Route path="/" element={<Home />} />
            <Route path="/metas" element={<Metas />} />
            <Route path="/ranking" element={<Ranking />} />
            <Route path="/moedas" element={<Carteira />} />
            <Route path="/conquistas" element={<Badges />} />
            <Route path="/perfil" element={<Perfil />} />
            <Route path="/academia" element={<Academia />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
