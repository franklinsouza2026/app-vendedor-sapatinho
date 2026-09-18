import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useApi } from '../utils/useApi';
import { Card } from '../components/Card';
import { LoadingState } from '../components/LoadingState';
import {
  buscarMinhaMatriz,
  buscarPDI,
  Certificacao,
  CompetenciaMatriz,
  DevelopmentPlanItem,
  emitirCertificacao,
  listarCertificacoesDisponiveis,
  listarMeusPDIs,
  listarMinhasCertificacoes,
  SugestaoIA,
  sugerirParaMim,
} from '../api/universidade';
import { ApiError } from '../api/client';
import { labelConfianca, labelNivelCompetencia, labelStatusPDI, labelTipoItemPDI } from '../utils/labels';

type Aba = 'evolucao' | 'plano' | 'certificacoes';

export function Universidade() {
  // A URL é a ÚNICA fonte da aba (Etapa 2A): o "Para Você" aponta pra
  // /universidade?aba=plano etc., então o clique precisa aterrissar na aba
  // certa — não adianta o link deixar de dar 404 e cair sempre em "evolução".
  //
  // Derivada, nunca copiada pra `useState`: o componente não remonta quando só
  // a query string muda, então um estado próprio ignoraria tanto um segundo
  // link interno quanto o voltar/avançar do navegador. Em troca, trocar de aba
  // pelo botão passa a deixar a URL compartilhável.
  const [params, setParams] = useSearchParams();
  const abaDaUrl = params.get('aba');
  const aba: Aba = abaDaUrl === 'plano' || abaDaUrl === 'certificacoes' ? abaDaUrl : 'evolucao';
  const setAba = (t: Aba) => setParams(t === 'evolucao' ? {} : { aba: t }, { replace: true });

  return (
    <div className="flex flex-col gap-4 p-4 pb-24">
      <div>
        <h1 className="text-xl font-semibold text-white">Universidade</h1>
        <p className="text-xs text-slate-400">Sua evolução, seu plano e suas certificações.</p>
      </div>

      <div className="flex gap-2 border-b border-slate-800 pb-2">
        {(['evolucao', 'plano', 'certificacoes'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setAba(t)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${aba === t ? 'bg-accent text-white' : 'bg-surface text-slate-400'}`}
          >
            {t === 'evolucao' ? 'Minha Evolução' : t === 'plano' ? 'Meu Plano' : 'Certificações'}
          </button>
        ))}
      </div>

      {aba === 'evolucao' && <MinhaEvolucao />}
      {aba === 'plano' && <MeuPlano />}
      {aba === 'certificacoes' && <Certificacoes />}
    </div>
  );
}

function MinhaEvolucao() {
  const { dados, carregando } = useApi(() => buscarMinhaMatriz(), []);
  if (carregando && !dados) return <LoadingState texto="Carregando sua evolução..." />;

  return (
    <div className="flex flex-col gap-3">
      <Link to="/universidade/revisao" className="text-xs text-accentSoft underline">
        Ver revisões pendentes →
      </Link>
      {dados?.competencias.map((c: CompetenciaMatriz) => (
        <Card key={c.competencyId}>
          <div className="flex items-center justify-between">
            <p className="font-medium text-white">{c.name}</p>
            {c.priority === 'HIGH' && c.status === 'OK' && <span className="rounded-full bg-amber-900/50 px-2 py-0.5 text-xs text-amber-300">foco recomendado</span>}
          </div>
          {c.status === 'NOT_ENOUGH_DATA' ? (
            <p className="mt-1 text-sm text-slate-400">Ainda sem dados suficientes — pratique mais pra vermos seu nível aqui.</p>
          ) : (
            <>
              <p className="mt-1 text-2xl font-bold text-white">
                {c.score} <span className="text-sm font-normal text-slate-400">/ 100</span>
              </p>
              <p className="text-xs text-slate-400">
                {labelNivelCompetencia(c.nivel)} · meta {c.target} · confiança {labelConfianca(c.confidence)}
              </p>
              {c.gap !== null && c.gap > 0 && (
                <>
                  <p className="mt-1 text-xs text-amber-400">Faltam {c.gap} pontos pra bater a meta.</p>
                  {/* Elo gap → recomendação → próxima ação (Etapa 2A): antes o
                      card dizia "faltam 25 pontos" e não oferecia caminho
                      nenhum — o vendedor via o diagnóstico e não o remédio. */}
                  <OQueEstudar competencyId={c.competencyId} />
                </>
              )}
            </>
          )}
        </Card>
      ))}
      {dados?.competencias.length === 0 && <p className="text-sm text-slate-400">Nenhuma competência configurada ainda.</p>}
    </div>
  );
}

/**
 * "O que estudar pra isso?" — dispara a recomendação de IA para a competência.
 *
 * Fica fechado por padrão e só chama a IA quando o vendedor pede: a chamada
 * custa dinheiro e a maioria das visitas à tela é só pra conferir o número.
 */
function OQueEstudar({ competencyId }: { competencyId: string }) {
  const [sugestoes, setSugestoes] = useState<SugestaoIA[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function pedir() {
    setCarregando(true);
    setErro(null);
    try {
      const res = await sugerirParaMim(competencyId);
      setSugestoes(res.sugestoes);
    } catch (err) {
      // IA desligada/sem orçamento devolve 503 — a tela diz isso sem quebrar,
      // e o resto da Universidade continua funcionando normalmente.
      setErro(err instanceof ApiError ? err.message : 'Não foi possível buscar sugestões agora.');
    } finally {
      setCarregando(false);
    }
  }

  if (sugestoes) {
    return sugestoes.length === 0 ? (
      <p className="mt-2 text-xs text-slate-400">Ainda não há conteúdo publicado ligado a esta competência.</p>
    ) : (
      <div className="mt-2 flex flex-col gap-1">
        <p className="text-xs uppercase tracking-wide text-slate-500">Por onde começar</p>
        {sugestoes.map((sug) =>
          // O destino vem do backend: uma sugestão de simulação leva ao
          // Simulador, não à Academia.
          sug.href ? (
            <Link key={sug.sourceId} to={sug.href} className="text-sm text-accentSoft hover:underline">
              {sug.title}
              <span className="block text-xs font-normal text-slate-400">{sug.rationale}</span>
            </Link>
          ) : (
            <p key={sug.sourceId} className="text-sm text-slate-200">
              {sug.title}
              <span className="block text-xs text-slate-400">{sug.rationale}</span>
            </p>
          )
        )}
      </div>
    );
  }

  return (
    <div className="mt-2">
      <button onClick={pedir} disabled={carregando} className="text-xs text-accentSoft underline disabled:opacity-50">
        {carregando ? 'Buscando...' : 'O que estudar pra isso?'}
      </button>
      {erro && <p className="mt-1 text-xs text-slate-400">{erro}</p>}
    </div>
  );
}

function MeuPlano() {
  const { dados, carregando } = useApi(() => listarMeusPDIs(), []);
  const [planoSelecionadoId, setPlanoSelecionadoId] = useState<string | null>(null);

  if (carregando && !dados) return <LoadingState texto="Carregando seus planos..." />;
  if (planoSelecionadoId) return <DetalhePlano id={planoSelecionadoId} onVoltar={() => setPlanoSelecionadoId(null)} />;

  return (
    <div className="flex flex-col gap-3">
      {dados?.planos.map((p) => (
        <button key={p.id} onClick={() => setPlanoSelecionadoId(p.id)} className="text-left">
          <Card>
            <p className="font-medium text-white">{p.competencia?.name ?? 'Plano de desenvolvimento'}</p>
            <p className="text-xs text-slate-400">
              Meta: {p.targetScore} · Status: {labelStatusPDI(p.status)}
            </p>
          </Card>
        </button>
      ))}
      {dados?.planos.length === 0 && <p className="text-sm text-slate-400">Você ainda não tem um plano de desenvolvimento ativo.</p>}
    </div>
  );
}

/**
 * Uma etapa do PDI.
 *
 * Antes desta etapa a linha mostrava só o tipo ("Aula") — o vendedor não sabia
 * QUAL aula nem como chegar nela. O backend agora resolve título e destino;
 * quando a etapa acontece fora do app (prática em loja, ação do gerente) não há
 * destino, e aí a linha é texto mesmo.
 */
function ItemDoPlano({ item }: { item: DevelopmentPlanItem }) {
  const conteudo = (
    <>
      <div>
        <p className="text-sm text-white">{item.titulo ?? labelTipoItemPDI(item.tipo)}</p>
        {item.titulo && <p className="text-xs text-slate-500">{labelTipoItemPDI(item.tipo)}</p>}
      </div>
      <span className="text-xs text-slate-500">{labelStatusPDI(item.status)}</span>
    </>
  );
  const classe = 'flex items-center justify-between rounded-lg border border-slate-800 p-3';

  return item.href ? (
    <Link to={item.href} className={`${classe} hover:border-slate-600`}>
      {conteudo}
    </Link>
  ) : (
    <div className={classe}>{conteudo}</div>
  );
}

function DetalhePlano({ id, onVoltar }: { id: string; onVoltar: () => void }) {
  const { dados } = useApi(() => buscarPDI(id), [id]);
  if (!dados) return <LoadingState texto="Carregando plano..." />;

  return (
    <div className="flex flex-col gap-3">
      <button onClick={onVoltar} className="self-start text-xs text-slate-400">
        ← Voltar
      </button>
      <Card>
        <p className="font-medium text-white">{dados.plano.competencia?.name}</p>
        <p className="text-xs text-slate-400">
          Baseline: {dados.plano.baselineScore ?? '—'} · Meta: {dados.plano.targetScore} · Status: {labelStatusPDI(dados.plano.status)}
        </p>
        {dados.evolucao && (
          <p className="mt-2 text-sm text-emerald-400">
            Antes: {dados.evolucao.antes} → Agora: {dados.evolucao.agora} ({dados.evolucao.delta >= 0 ? '+' : ''}
            {dados.evolucao.delta})
          </p>
        )}
      </Card>
      <div className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-wide text-slate-500">Etapas</p>
        {dados.plano.itens.map((item) => (
          <ItemDoPlano key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}

function Certificacoes() {
  const { sessao } = useAuth();
  const { dados: minhas, recarregar: recarregarMinhas } = useApi(() => listarMinhasCertificacoes(), []);
  const { dados: disponiveis, recarregar: recarregarDisponiveis } = useApi(() => listarCertificacoesDisponiveis(), []);
  const [erro, setErro] = useState<string | null>(null);
  const [certificadoAbertoId, setCertificadoAbertoId] = useState<string | null>(null);

  async function handleEmitir(definitionId: string) {
    setErro(null);
    try {
      await emitirCertificacao(definitionId);
      recarregarMinhas();
      recarregarDisponiveis();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'não foi possível emitir agora');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {erro && <p className="text-xs text-red-400">{erro}</p>}
      <div>
        <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Suas certificações</p>
        <div className="flex flex-col gap-2">
          {minhas?.certificacoes.map((c) => (
            <Card key={c.id}>
              <div className="flex items-center justify-between">
                <p className="font-medium text-white">{c.definicao.name}</p>
                <span
                  className={`text-xs ${c.status === 'VALID' ? 'text-emerald-400' : c.status === 'EXPIRING' ? 'text-amber-400' : 'text-red-400'}`}
                >
                  {c.status === 'VALID' ? 'ativa' : c.status === 'EXPIRING' ? 'expirando' : 'expirada'}
                </span>
              </div>
              {c.expiresAt && <p className="text-xs text-slate-400">Expira em {new Date(c.expiresAt).toLocaleDateString('pt-BR')}</p>}
              <button onClick={() => setCertificadoAbertoId(certificadoAbertoId === c.id ? null : c.id)} className="mt-2 text-xs text-accentSoft underline">
                {certificadoAbertoId === c.id ? 'fechar certificado' : 'ver certificado'}
              </button>
              {certificadoAbertoId === c.id && <CertificadoVisual certificacao={c} nomeParticipante={sessao!.vendedor.nome} />}
            </Card>
          ))}
          {minhas?.certificacoes.length === 0 && <p className="text-sm text-slate-400">Você ainda não tem certificações.</p>}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Disponíveis</p>
        <div className="flex flex-col gap-2">
          {disponiveis?.disponiveis.map((d) => (
            <Card key={d.definicao.id}>
              <p className="font-medium text-white">{d.definicao.name}</p>
              <p className="text-xs text-slate-400">{d.definicao.description}</p>
              {!d.elegibilidade.elegivel && <p className="mt-1 text-xs text-amber-400">Pendências: {d.elegibilidade.pendencias.join('; ')}</p>}
              <button
                onClick={() => handleEmitir(d.definicao.id)}
                disabled={!d.elegibilidade.elegivel}
                className="mt-2 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              >
                Emitir
              </button>
            </Card>
          ))}
          {disponiveis?.disponiveis.length === 0 && <p className="text-sm text-slate-400">Nenhuma certificação disponível ainda.</p>}
        </div>
      </div>
    </div>
  );
}

// Render visual do certificado (Fatia 9.6, seção 46-48) — só texto, nunca
// upload/logo (nenhum pipeline de upload existe no projeto ainda); usa o
// template do Admin com fallback neutro quando ele ainda não configurou nada.
function CertificadoVisual({ certificacao, nomeParticipante }: { certificacao: Certificacao; nomeParticipante: string }) {
  const titulo = certificacao.definicao.templateTitle || 'Certificado de Conclusão';
  const corpo = certificacao.definicao.templateBody || `Certificamos que o(a) participante concluiu com êxito os requisitos de "${certificacao.definicao.name}".`;

  return (
    <div className="mt-3 rounded-lg border-2 border-accent/40 bg-base p-5 text-center">
      <p className="text-xs uppercase tracking-widest text-accentSoft">{titulo}</p>
      <p className="mt-3 text-lg font-semibold text-white">{nomeParticipante}</p>
      <p className="mt-3 text-sm text-slate-300">{corpo}</p>
      <p className="mt-3 text-xs text-slate-500">Emitido em {new Date(certificacao.issuedAt).toLocaleDateString('pt-BR')} · código {certificacao.id.slice(0, 8).toUpperCase()}</p>
      {certificacao.definicao.signatureName && (
        <div className="mt-4 border-t border-slate-700 pt-2">
          <p className="text-sm text-white">{certificacao.definicao.signatureName}</p>
          {certificacao.definicao.signatureRole && <p className="text-xs text-slate-500">{certificacao.definicao.signatureRole}</p>}
        </div>
      )}
    </div>
  );
}
