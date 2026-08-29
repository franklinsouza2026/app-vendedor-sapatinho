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
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
