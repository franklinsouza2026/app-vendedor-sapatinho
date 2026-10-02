/**
 * Admin da Fase 1 — duas partes:
 *  1. AUDITORIA do Admin real: o que já dá para operar hoje, com link para a
 *     tela existente (reaproveitamento, nada reconstruído).
 *  2. UX SIMULADA do que falta (campanhas, missões de venda, reconhecimento,
 *     elegibilidade). Nada salva. Cada tela diz de qual backend depende.
 *
 * Meta: o Admin operar a Fase 1 sem Claude, terminal, seed ou banco.
 */
import { FormEvent, ReactNode, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useFase1 } from '../demo/Fase1Contexto';
import { Abas, Pilula } from '../componentes/ui';
import { periodo } from '../formato';

type Situacao = 'PRONTO' | 'PARCIAL' | 'AUSENTE';

const AUDITORIA: { item: string; situacao: Situacao; tela: string | null; nota: string }[] = [
  { item: 'Vendedores', situacao: 'PRONTO', tela: '/admin/usuarios', nota: 'Criar, bloquear, realocar e reemitir acesso.' },
  { item: 'Lojas', situacao: 'PRONTO', tela: '/admin/estrutura', nota: 'Cadastro, inativação e reativação.' },
  { item: 'Metas', situacao: 'PRONTO', tela: '/admin/metas', nota: 'Meta por vendedor e período (dia/semana/mês). Sem importação em lote.' },
  { item: 'Temporadas', situacao: 'PRONTO', tela: '/admin/gamificacao', nota: 'Criar, agendar, ativar e finalizar.' },
  { item: 'Ligas', situacao: 'PRONTO', tela: '/admin/gamificacao', nota: 'Criar e ajustar limiares de promoção/rebaixamento.' },
  { item: 'Competições', situacao: 'PARCIAL', tela: '/admin/gamificacao', nota: 'Ciclo de vida completo; métricas fixas. Sem duelo, sem categoria/produto, sem prêmio físico.' },
  { item: 'Premiações', situacao: 'PARCIAL', tela: '/admin/gamificacao', nota: 'XP, moedas e badge por competição. Prêmio físico/descrição livre não existe.' },
  { item: 'XP', situacao: 'PARCIAL', tela: null, nota: 'Regras versionadas em código. Sem tela de regras nem ajuste manual.' },
  { item: 'VendaCoins', situacao: 'PARCIAL', tela: null, nota: 'Ledger automático. Sem ajuste manual pelo Admin, sem catálogo de resgate.' },
  { item: 'Badges', situacao: 'PARCIAL', tela: null, nota: 'Catálogo fixo em código (10 badges). Sem criação pela tela.' },
  { item: 'Elegibilidade', situacao: 'PARCIAL', tela: null, nota: 'Regra fixa (papel/status). Sem período de adaptação de vendedor novo.' },
  { item: 'Campanhas', situacao: 'AUSENTE', tela: null, nota: 'Não existe entidade. Hoje: Temporada + Competições soltas.' },
  { item: 'Missões de venda', situacao: 'AUSENTE', tela: null, nota: 'Motor atual só gera missões de treinamento, por catálogo seed.' },
  { item: 'Reconhecimentos', situacao: 'AUSENTE', tela: null, nota: 'Só o GERENTE reconhece (/equipe). Na Fase 1, quem reconhece é o Admin.' },
];

const TOM: Record<Situacao, 'sucesso' | 'aviso' | 'neutro'> = { PRONTO: 'sucesso', PARCIAL: 'aviso', AUSENTE: 'neutro' };
const ROTULO: Record<Situacao, string> = { PRONTO: '● Pronto', PARCIAL: '◐ Parcial', AUSENTE: '○ Ausente' };

type Aba = 'auditoria' | 'campanhas' | 'missoes' | 'reconhecer' | 'regras';

export function Admin() {
  const { perfil, sair } = useFase1();
  const navegar = useNavigate();
  const [aba, setAba] = useState<Aba>('auditoria');

  if (perfil !== 'ADMIN') {
    // Admin só pela porta de entrada — evita cair aqui como "vendedora".
    return (
      <div className="fase1 mx-auto max-w-md p-6 text-center">
        <p className="text-slate-300">Esta área é do Admin.</p>
        <Link to="/fase1" className="mt-3 inline-flex min-h-[44px] items-center text-accentSoft">
          Voltar à entrada
        </Link>
      </div>
    );
  }

  return (
    <div className="fase1 mx-auto flex w-full max-w-5xl flex-col gap-5 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-accentSoft">Admin · Fase 1</p>
          <h1 className="text-2xl font-bold text-white">Operação de Performance & Game</h1>
        </div>
        <button
          onClick={() => {
            sair();
            navegar('/fase1');
          }}
          className="min-h-[44px] rounded-full border border-slate-700 px-4 text-sm text-slate-300"
        >
          Sair da demonstração
        </button>
      </header>

      <Abas<Aba>
        rotulo="Áreas do Admin"
        ativa={aba}
        onTrocar={setAba}
        abas={[
          { id: 'auditoria', rotulo: 'O que já existe' },
          { id: 'campanhas', rotulo: 'Campanhas' },
          { id: 'missoes', rotulo: 'Missões de venda' },
          { id: 'reconhecer', rotulo: 'Reconhecer' },
          { id: 'regras', rotulo: 'Regras do jogo' },
        ]}
      />

      {aba === 'auditoria' && <Auditoria />}
      {aba !== 'auditoria' && (
        <p className="rounded-xl border border-dashed border-sky-500/50 bg-sky-500/5 px-4 py-3 text-sm text-sky-100">
          🧪 <strong>Simulação de UX.</strong> Nada aqui é salvo. Esta tela depende de backend que ainda não existe — serve para decidirmos como o Admin vai operar.
        </p>
      )}
      {aba === 'campanhas' && <Campanhas />}
      {aba === 'missoes' && <MissoesVenda />}
      {aba === 'reconhecer' && <Reconhecer />}
      {aba === 'regras' && <Regras />}
    </div>
  );
}

function Auditoria() {
  const contagem = (s: Situacao) => AUDITORIA.filter((a) => a.situacao === s).length;
  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        {(['PRONTO', 'PARCIAL', 'AUSENTE'] as Situacao[]).map((s) => (
          <div key={s} className="rounded-2xl border border-slate-700/60 bg-surface p-3 text-center">
            <p className="text-3xl font-bold text-white">{contagem(s)}</p>
            <p className="text-xs text-slate-400">{ROTULO[s]}</p>
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-700/60">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Capacidades do Admin para a Fase 1</caption>
          <thead className="bg-surface text-xs text-slate-400">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Capacidade</th>
              <th scope="col" className="px-3 py-2 font-medium">Situação</th>
              <th scope="col" className="hidden px-3 py-2 font-medium md:table-cell">Observação</th>
              <th scope="col" className="px-3 py-2 font-medium">Tela atual</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {AUDITORIA.map((a) => (
              <tr key={a.item} className="align-top">
                <th scope="row" className="px-3 py-2.5 font-medium text-white">
                  {a.item}
                  <span className="mt-0.5 block text-xs font-normal text-slate-400 md:hidden">{a.nota}</span>
                </th>
                <td className="px-3 py-2.5">
                  <Pilula tom={TOM[a.situacao]}>{ROTULO[a.situacao]}</Pilula>
                </td>
                <td className="hidden px-3 py-2.5 text-slate-300 md:table-cell">{a.nota}</td>
                <td className="px-3 py-2.5">
                  {a.tela ? (
                    <a href={a.tela} className="text-accentSoft underline-offset-2 hover:underline">
                      abrir
                    </a>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400">“Abrir” leva ao Admin real (exige login e backend rodando). A Fase 1 não alterou nenhuma dessas telas.</p>
    </>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-slate-300">{rotulo}</span>
      {children}
    </label>
  );
}

const INPUT = 'min-h-[44px] rounded-lg border border-slate-700 bg-base px-3 text-white';

function useSimulacao() {
  const [aviso, setAviso] = useState<string | null>(null);
  return {
    aviso,
    simular: (e: FormEvent, texto: string) => {
      e.preventDefault();
      setAviso(texto);
    },
  };
}

function AvisoSimulado({ texto }: { texto: string | null }) {
  if (!texto) return null;
  return (
    <p role="status" className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
      ✓ {texto} <span className="text-emerald-300/80">(simulado — nada foi salvo)</span>
    </p>
  );
}

function Campanhas() {
  const { dados } = useFase1();
  const { aviso, simular } = useSimulacao();
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="rounded-2xl border border-slate-700/60 bg-surface p-4">
        <h2 className="font-semibold text-white">Campanhas</h2>
        {dados.campanha ? (
          <div className="mt-3 rounded-xl bg-slate-800/80 p-3">
            <p className="font-semibold text-white">{dados.campanha.nome}</p>
            <p className="text-xs text-slate-400">{periodo(dados.campanha.iniciaEm, dados.campanha.terminaEm)} · ativa</p>
            <ul className="mt-2 text-sm text-slate-300">
              {dados.campanha.frentes.map((f) => (
                <li key={f.id}>
                  {f.icone} {f.titulo} — <span className="text-slate-400">{f.premio}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-400">Nenhuma campanha.</p>
        )}
      </section>
      <form onSubmit={(e) => simular(e, 'Campanha criada')} className="flex flex-col gap-3 rounded-2xl border border-slate-700/60 bg-surface p-4">
        <h2 className="font-semibold text-white">Nova campanha</h2>
        <Campo rotulo="Nome">
          <input className={INPUT} defaultValue="Novembro Black" />
        </Campo>
        <div className="grid grid-cols-2 gap-2">
          <Campo rotulo="Início">
            <input type="date" className={INPUT} defaultValue="2026-11-01" />
          </Campo>
          <Campo rotulo="Fim">
            <input type="date" className={INPUT} defaultValue="2026-11-30" />
          </Campo>
        </div>
        <fieldset className="flex flex-col gap-1 text-sm text-slate-300">
          <legend className="mb-1">Frentes da campanha</legend>
          {['🏆 Top vendedor', '🚀 Maior evolução', '🎯 Meta batida', '🏬 Loja campeã', '🔥 Desafio semanal'].map((f) => (
            <label key={f} className="flex min-h-[40px] items-center gap-2">
              <input type="checkbox" defaultChecked className="h-5 w-5 accent-amber-500" /> {f}
            </label>
          ))}
        </fieldset>
        <button className="min-h-[44px] rounded-full bg-accent font-semibold text-white">Criar campanha</button>
        <AvisoSimulado texto={aviso} />
      </form>
    </div>
  );
}

function MissoesVenda() {
  const { dados } = useFase1();
  const { aviso, simular } = useSimulacao();
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="rounded-2xl border border-slate-700/60 bg-surface p-4">
        <h2 className="font-semibold text-white">Missões ativas</h2>
        <ul className="mt-2 divide-y divide-slate-800 text-sm">
          {dados.missoes.map((m) => (
            <li key={m.id} className="py-2">
              <p className="text-white">{m.titulo}</p>
              <p className="text-xs text-slate-400">
                Alvo: {m.alvo} {m.unidade === 'par' ? 'pares' : m.unidade === 'venda' ? 'vendas' : m.unidade === 'dia' ? 'dias' : 'R$'} · +{m.recompensa.xp} XP · +{m.recompensa.moedas} 🪙
              </p>
            </li>
          ))}
          {dados.missoes.length === 0 && <li className="py-2 text-slate-400">Nenhuma.</li>}
        </ul>
      </section>
      <form onSubmit={(e) => simular(e, 'Missão publicada para Caruaru Shopping')} className="flex flex-col gap-3 rounded-2xl border border-slate-700/60 bg-surface p-4">
        <h2 className="font-semibold text-white">Nova missão</h2>
        <Campo rotulo="Tipo">
          <select className={INPUT} defaultValue="PRODUTO_SEMANA">
            <option value="DIARIA">Diária</option>
            <option value="SEMANAL">Semanal</option>
            <option value="CATEGORIA">Categoria</option>
            <option value="PRODUTO_SEMANA">Produto da Semana</option>
            <option value="PONTA_ESTOQUE">Ponta de estoque</option>
          </select>
        </Campo>
        <Campo rotulo="Produtos (referência)">
          <input className={INPUT} defaultValue="12345" />
        </Campo>
        <div className="grid grid-cols-3 gap-2">
          <Campo rotulo="Alvo (pares)">
            <input type="number" className={INPUT} defaultValue={3} />
          </Campo>
          <Campo rotulo="XP">
            <input type="number" className={INPUT} defaultValue={30} />
          </Campo>
          <Campo rotulo="VendaCoins">
            <input type="number" className={INPUT} defaultValue={10} />
          </Campo>
        </div>
        <Campo rotulo="Lojas">
          <select className={INPUT} defaultValue="todas">
            <option value="todas">Todas</option>
            <option value="caruaru">Caruaru Shopping</option>
          </select>
        </Campo>
        <button className="min-h-[44px] rounded-full bg-accent font-semibold text-white">Publicar missão</button>
        <AvisoSimulado texto={aviso} />
      </form>
    </div>
  );
}

function Reconhecer() {
  const { dados } = useFase1();
  const { aviso, simular } = useSimulacao();
  return (
    <form onSubmit={(e) => simular(e, 'Reconhecimento enviado')} className="flex max-w-xl flex-col gap-3 rounded-2xl border border-slate-700/60 bg-surface p-4">
      <h2 className="font-semibold text-white">Reconhecer um vendedor</h2>
      <Campo rotulo="Vendedor">
        <select className={INPUT}>
          {dados.pessoas.map((p) => (
            <option key={p.id}>{p.nome}</option>
          ))}
        </select>
      </Campo>
      <Campo rotulo="Título">
        <input className={INPUT} defaultValue="Atendimento que vira fidelidade" />
      </Campo>
      <Campo rotulo="Mensagem">
        <textarea rows={3} className={`${INPUT} py-2`} defaultValue="Três clientes citaram seu nome na pesquisa da semana." />
      </Campo>
      <button className="min-h-[44px] rounded-full bg-accent font-semibold text-white">Enviar reconhecimento</button>
      <AvisoSimulado texto={aviso} />
    </form>
  );
}

function Regras() {
  const { aviso, simular } = useSimulacao();
  return (
    <form onSubmit={(e) => simular(e, 'Regras atualizadas')} className="grid gap-4 md:grid-cols-2">
      <section className="flex flex-col gap-3 rounded-2xl border border-slate-700/60 bg-surface p-4">
        <h2 className="font-semibold text-white">Elegibilidade</h2>
        <Campo rotulo="Vendedor novo entra no ranking após">
          <select className={INPUT} defaultValue="7">
            <option value="0">Imediatamente</option>
            <option value="7">7 dias com venda</option>
            <option value="30">30 dias de casa</option>
          </select>
        </Campo>
        <label className="flex min-h-[44px] items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" defaultChecked className="h-5 w-5 accent-amber-500" /> Ocultar faturamento das colegas no ranking
        </label>
      </section>
      <section className="flex flex-col gap-3 rounded-2xl border border-slate-700/60 bg-surface p-4">
        <h2 className="font-semibold text-white">Estimativas</h2>
        <Campo rotulo="Ticket de referência">
          <select className={INPUT} defaultValue="mes">
            <option value="mes">Ticket médio do mês do vendedor</option>
            <option value="90d">Ticket médio dos últimos 90 dias</option>
            <option value="loja">Ticket médio da loja</option>
          </select>
        </Campo>
        <Campo rotulo="Métrica principal da corrida (Home)">
          <select className={INPUT} defaultValue="VENDAS">
            <option value="VENDAS">Vendas (R$)</option>
            <option value="SCORE">Score Geral</option>
            <option value="PERCENTUAL_META">% da Meta</option>
          </select>
        </Campo>
        <button className="min-h-[44px] rounded-full bg-accent font-semibold text-white">Salvar regras</button>
        <AvisoSimulado texto={aviso} />
      </section>
    </form>
  );
}
