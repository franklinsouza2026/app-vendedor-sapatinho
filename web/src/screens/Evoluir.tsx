import { Link } from 'react-router-dom';
import { Card } from '../components/Card';

const MODULOS = [
  { to: '/coach', emoji: '💬', titulo: 'Conselheiro', descricao: 'Organize seu foco e sua performance.', cor: 'border-coach' },
  { to: '/treinador', emoji: '🎯', titulo: 'Treinador', descricao: 'Aprenda como agir melhor numa situação de venda.', cor: 'border-treinador' },
  { to: '/simulador', emoji: '🎭', titulo: 'Simulador', descricao: 'Pratique um atendimento real com uma cliente virtual.', cor: 'border-simulador' },
  { to: '/academia', emoji: '🎓', titulo: 'Academia', descricao: 'Aprenda através de aulas e exercícios rápidos.', cor: 'border-academia' },
];

export function Evoluir() {
  return (
    <div className="flex flex-col gap-4 p-4 pb-24">
      <div>
        <h1 className="text-xl font-semibold text-white">Evoluir</h1>
        <p className="text-xs text-slate-400">Escolha como você quer evoluir hoje.</p>
      </div>

      <div className="flex flex-col gap-3">
        {MODULOS.map((m) => (
          <Link key={m.to} to={m.to}>
            <Card className={`flex items-center gap-3 border-l-4 ${m.cor}`}>
              <span className="text-2xl">{m.emoji}</span>
              <div>
                <p className="font-medium text-white">{m.titulo}</p>
                <p className="text-xs text-slate-400">{m.descricao}</p>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
