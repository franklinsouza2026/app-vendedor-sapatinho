import { Link, useLocation } from 'react-router-dom';

const ITENS = [
  { to: '/admin/usuarios', label: 'Usuários' },
  { to: '/admin/treinamento', label: 'Treinamento' },
  { to: '/admin/universidade', label: 'Universidade' },
  { to: '/admin/gamificacao', label: 'Gamificação' },
  { to: '/admin/ai', label: 'IA' },
];

export function AdminNav() {
  const location = useLocation();

  return (
    <nav className="mb-2 flex gap-4 border-b border-slate-800 pb-2">
      {ITENS.map((item) => {
        const ativo = location.pathname.startsWith(item.to);
        return (
          <Link
            key={item.to}
            to={item.to}
            className={`text-sm font-medium ${ativo ? 'text-white' : 'text-slate-500 hover:text-slate-300'}`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
