import { Link } from 'react-router-dom';
import { Card } from '../components/Card';
import { useApi } from '../utils/useApi';
import { buscarParaVoce } from '../api/universidade';

// Conselheiro saiu daqui (Fatia 9.6, seção 17) — a entrada principal agora
// é um card logo após a saudação na Home; a rota /coach continua funcionando.
const MODULOS = [
  { to: '/treinador', emoji: '🎯', titulo: 'Treinador', descricao: 'Aprenda como agir melhor numa situação de venda.', cor: 'border-treinador' },
  { to: '/simulador', emoji: '🎭', titulo: 'Simulador', descricao: 'Pratique um atendimento real com uma cliente virtual.', cor: 'border-simulador' },
  { to: '/academia', emoji: '🎓', titulo: 'Academia', descricao: 'Aprenda através de aulas e exercícios rápidos.', cor: 'border-academia' },
  { to: '/universidade', emoji: '🧭', titulo: 'Universidade', descricao: 'Sua evolução, seu plano e suas certificações.', cor: 'border-slate-500' },
];

export function Evoluir() {
  const { dados } = useApi(() => buscarParaVoce(), []);

  return (
    <div className="flex flex-col gap-4 p-4 pb-24">
      <div>
        <h1 className="text-xl font-semibold text-white">Evoluir</h1>
        <p className="text-xs text-slate-400">Escolha como você quer evoluir hoje.</p>
      </div>

      {dados && dados.itens.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-wide text-slate-500">Para você</p>
          {dados.itens.map((item, i) => (
            <Link key={i} to={item.href}>
              <Card className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">{item.titulo}</p>
                  <p className="text-xs text-slate-400">{item.descricao}</p>
                </div>
                <span aria-hidden="true" className="text-slate-500">
                  →
                </span>
              </Card>
            </Link>
          ))}
        </div>
      )}

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
