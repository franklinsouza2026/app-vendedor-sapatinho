// "PENDÊNCIAS" — Manager Inbox (Fatia 9, seção 58-62). Agrega alertas +
// follow-ups + sugestões de reconhecimento num painel único, priorizado,
// sempre em tom não-judicativo.
import { Link } from 'react-router-dom';
import { useApi } from '../utils/useApi';
import { buscarPendencias, concluirFollowUp, dispensarFollowUp, ItemInboxDTO } from '../api/managerPanel';
import { Card } from '../components/Card';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { labelAlerta } from '../utils/alertLabels';

const ROTULO_TIPO: Record<ItemInboxDTO['tipo'], string> = {
  ALERT: 'Situação identificada',
  FOLLOWUP: 'Follow-up agendado',
  RECOGNITION_SUGGESTION: 'Reconhecimento sugerido',
};

export function Pendencias() {
  const { dados, carregando, erro, recarregar } = useApi(() => buscarPendencias(), []);

  if (carregando && !dados) return <LoadingState texto="Carregando pendências..." />;
  if (erro) return <ErrorState mensagem={erro} onRetry={recarregar} />;
  if (!dados) return null;

  const { resumo, itens } = dados;

  async function handleConcluir(id: string) {
    await concluirFollowUp(id);
    recarregar();
  }

  async function handleDispensar(id: string) {
    await dispensarFollowUp(id);
    recarregar();
  }

  return (
    <div className="flex flex-col gap-4 p-4 pb-24">
      <Link to="/" className="self-start text-sm text-slate-400">← Voltar</Link>
      <h1 className="text-xl font-semibold text-white">Pendências</h1>
      <p className="text-sm text-slate-400">
        Hoje você tem: {resumo.vendedoresAbaixoDaMetaEsperada} vendedor(es) abaixo do ritmo esperado, {resumo.followUpsPendentes} follow-up(s) pendente(s), {resumo.reconhecimentosSugeridos} reconhecimento(s) sugerido(s) e {resumo.treinamentosPendentes} treinamento(s) com prazo vencido.
      </p>

      <div className="flex flex-col gap-2">
        {itens.map((item, i) => (
          <Card key={i}>
            <p className="text-xs uppercase tracking-wide text-slate-500">{ROTULO_TIPO[item.tipo]}</p>
            {item.tipo === 'FOLLOWUP' && typeof item.detalhe.descricao === 'string' && <p className="text-sm text-white">{item.detalhe.descricao}</p>}
            {item.tipo === 'ALERT' && typeof item.detalhe.alertType === 'string' && <p className="text-sm text-white">{labelAlerta(item.detalhe.alertType)}</p>}
            {item.tipo === 'RECOGNITION_SUGGESTION' && typeof item.detalhe.descricao === 'string' && <p className="text-sm text-white">{item.detalhe.descricao}</p>}
            {item.tipo === 'FOLLOWUP' && item.refId && (
              <div className="mt-2 flex gap-2">
                <button onClick={() => handleConcluir(item.refId!)} className="rounded-lg bg-accent px-3 py-1 text-xs font-medium text-white">
                  Concluir
                </button>
                <button onClick={() => handleDispensar(item.refId!)} className="rounded-lg border border-slate-700 px-3 py-1 text-xs text-slate-300">
                  Dispensar
                </button>
              </div>
            )}
          </Card>
        ))}
        {itens.length === 0 && <p className="text-sm text-slate-400">Nenhuma pendência agora. 🎉</p>}
      </div>
    </div>
  );
}
