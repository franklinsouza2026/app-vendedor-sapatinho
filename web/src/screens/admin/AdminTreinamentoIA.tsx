import { FormEvent, useState } from 'react';
import { useApi } from '../../utils/useApi';
import {
  cancelarJobTreinamento,
  criarJobTreinamento,
  buscarJobTreinamento,
  JobDetalhado,
  listarCenariosTreinamento,
  listarJobsTreinamento,
  revisarJobTreinamento,
  StatusJobTreinamento,
  transicionarCenarioTreinamento,
  TrainingIntelligenceJob,
} from '../../api/trainingIntelligence';
import { ApiError } from '../../api/client';
import { LoadingState } from '../../components/LoadingState';

const LABEL_STATUS_JOB: Record<StatusJobTreinamento, string> = {
  QUEUED: 'na fila',
  RUNNING: 'em execução',
  WAITING_REVIEW: 'aguardando revisão',
  COMPLETED: 'concluído',
  FAILED: 'falhou',
  CANCELLED: 'cancelado',
};

export function AbaTreinamentoIA() {
  const { dados, recarregar } = useApi(() => listarJobsTreinamento(), []);
  const [jobSelecionadoId, setJobSelecionadoId] = useState<string | null>(null);
  const [topic, setTopic] = useState('');
  const [objective, setObjective] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  async function handleCriar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    try {
      const job = await criarJobTreinamento({ naturalLanguageRequest: topic, objective: objective || undefined });
      setTopic('');
      setObjective('');
      recarregar();
      setJobSelecionadoId(job.id);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'não foi possível criar o job de IA');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleCriar} className="flex flex-col gap-2 rounded-lg border border-slate-800 p-4">
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Peça um treinamento (linguagem natural)
          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder='Ex.: "Crie um treinamento para vendedores sobre como aumentar venda complementar"'
            required
            className="rounded-lg bg-surface px-3 py-2 text-sm text-white"
            rows={2}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Objetivo (opcional)
          <input value={objective} onChange={(e) => setObjective(e.target.value)} className="rounded-lg bg-surface px-3 py-2 text-sm text-white" />
        </label>
        <button type="submit" className="self-start rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
          Gerar rascunho com IA
        </button>
        {erro && <p className="text-xs text-red-400">{erro}</p>}
        <p className="text-xs text-slate-500">
          A IA nunca publica sozinha — todo resultado vira rascunho pra você revisar, editar, aprovar ou rejeitar.
        </p>
      </form>

      <div className="flex flex-col gap-2">
        {dados?.jobs.map((job: TrainingIntelligenceJob) => (
          <button
            key={job.id}
            type="button"
            onClick={() => setJobSelecionadoId(job.id)}
            className="flex items-center justify-between rounded-lg border border-slate-800 p-3 text-left"
          >
            <div>
              <p className="font-medium text-white">{job.topic}</p>
              <p className="text-xs text-slate-500">{job.type === 'ATUALIZACAO_CONTEUDO' ? 'atualização de conteúdo' : 'pacote de treinamento'}</p>
            </div>
            <span className="text-xs text-slate-500">{LABEL_STATUS_JOB[job.status]}</span>
          </button>
        ))}
        {dados?.jobs.length === 0 && <p className="text-sm text-slate-400">Nenhum job de IA ainda.</p>}
      </div>

      {jobSelecionadoId && <DetalheJob jobId={jobSelecionadoId} onFechar={() => setJobSelecionadoId(null)} onMudou={recarregar} />}

      <CenariosDraft />
    </div>
  );
}

function DetalheJob({ jobId, onFechar, onMudou }: { jobId: string; onFechar: () => void; onMudou: () => void }) {
  const { dados, recarregar } = useApi(() => buscarJobTreinamento(jobId), [jobId]);
  const [notes, setNotes] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  async function handleCancelar() {
    setErro(null);
    try {
      await cancelarJobTreinamento(jobId);
      recarregar();
      onMudou();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'não foi possível cancelar');
    }
  }

  async function handleRevisar(outcome: 'APPROVED' | 'REJECTED') {
    setErro(null);
    try {
      await revisarJobTreinamento(jobId, outcome, notes || undefined);
      recarregar();
      onMudou();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'não foi possível registrar a revisão');
    }
  }

  if (!dados) return <LoadingState texto="Carregando job..." />;
  const { job, draftLesson, draftQuestions, draftScenarios }: JobDetalhado = dados;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-700 bg-base p-4">
      <div className="flex items-center justify-between">
        <p className="font-medium text-white">{job.topic}</p>
        <div className="flex items-center gap-3">
          <button onClick={() => recarregar()} className="text-xs text-accentSoft underline">
            Atualizar
          </button>
          <button onClick={onFechar} className="text-xs text-slate-400 underline">
            Fechar
          </button>
        </div>
      </div>
      <p className="text-xs text-slate-500">
        Status: {LABEL_STATUS_JOB[job.status]} {job.currentStep && `· etapa: ${job.currentStep}`}
      </p>
      {job.errorMessage && <p className="text-xs text-red-400">{job.errorMessage}</p>}
      {job.governanceStatus && <p className="text-xs text-amber-400">Governança: {job.governanceStatus}</p>}

      {job.sources.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Fontes usadas</p>
          <ul className="mt-1 flex flex-col gap-1 text-xs text-slate-300">
            {job.sources.map((s) => (
              <li key={s.id}>
                {s.title} — {s.publisher ?? 'publisher desconhecido'} (confiabilidade: {s.reliability})
              </li>
            ))}
          </ul>
        </div>
      )}

      {job.findings.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Achados de governança</p>
          <ul className="mt-1 flex flex-col gap-1 text-xs text-amber-300">
            {job.findings.map((f) => (
              <li key={f.id}>
                [{f.type}] {f.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {draftLesson && (
        <div className="rounded-lg bg-surface p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Rascunho de aula ({draftLesson.status})</p>
          <p className="mt-1 text-sm font-medium text-white">{draftLesson.title}</p>
          <p className="mt-1 whitespace-pre-wrap text-xs text-slate-300">{draftLesson.content}</p>
          {draftQuestions.length > 0 && <p className="mt-2 text-xs text-slate-400">{draftQuestions.length} questão(ões) de quiz em rascunho (revise em Aulas → Configurar quiz)</p>}
        </div>
      )}
      {draftScenarios.length > 0 && <p className="text-xs text-slate-400">{draftScenarios.length} rascunho(s) de cenário de simulação gerado(s) — veja na seção "Cenários de simulação (IA)" abaixo.</p>}

      {job.status === 'WAITING_REVIEW' && (
        <div className="flex flex-col gap-2 border-t border-slate-800 pt-3">
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Notas da revisão (opcional)
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className="rounded-lg bg-surface px-3 py-2 text-sm text-white" />
          </label>
          <div className="flex gap-2">
            <button onClick={() => handleRevisar('APPROVED')} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white">
              Aprovar
            </button>
            <button onClick={() => handleRevisar('REJECTED')} className="rounded-lg border border-red-800 px-3 py-1.5 text-xs text-red-400">
              Rejeitar
            </button>
          </div>
        </div>
      )}
      {(job.status === 'QUEUED' || job.status === 'RUNNING') && (
        <button onClick={handleCancelar} className="self-start rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300">
          Cancelar job
        </button>
      )}
      {erro && <p className="text-xs text-red-400">{erro}</p>}
    </div>
  );
}

function CenariosDraft() {
  const { dados, recarregar } = useApi(() => listarCenariosTreinamento(), []);
  if (!dados || dados.cenarios.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs uppercase tracking-wide text-slate-500">Cenários de simulação (IA)</p>
      {dados.cenarios.map((c) => (
        <div key={c.id} className="flex items-center justify-between rounded-lg border border-slate-800 p-3">
          <div>
            <p className="text-sm text-white">{c.title}</p>
            <p className="text-xs text-slate-500">{c.status}</p>
          </div>
          <BotaoTransicaoCenario id={c.id} status={c.status} onMudou={recarregar} />
        </div>
      ))}
    </div>
  );
}

const PROXIMA_TRANSICAO_CENARIO: Partial<Record<string, { transicao: 'submeter' | 'aprovar' | 'publicar'; label: string }>> = {
  DRAFT: { transicao: 'submeter', label: 'Enviar pra revisão' },
  REVIEW_PENDING: { transicao: 'aprovar', label: 'Aprovar' },
  APPROVED: { transicao: 'publicar', label: 'Publicar no Simulador' },
};

function BotaoTransicaoCenario({ id, status, onMudou }: { id: string; status: string; onMudou: () => void }) {
  const [erro, setErro] = useState<string | null>(null);
  const proxima = PROXIMA_TRANSICAO_CENARIO[status];

  async function executar(transicao: 'submeter' | 'aprovar' | 'publicar' | 'arquivar') {
    setErro(null);
    try {
      await transicionarCenarioTreinamento(id, transicao);
      onMudou();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'falha na transição');
    }
  }

  return (
    <div className="flex items-center gap-2">
      {proxima && (
        <button onClick={() => executar(proxima.transicao)} className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-white">
          {proxima.label}
        </button>
      )}
      {status !== 'ARCHIVED' && (
        <button onClick={() => executar('arquivar')} className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">
          Arquivar
        </button>
      )}
      {erro && <span className="text-xs text-red-400">{erro}</span>}
    </div>
  );
}
