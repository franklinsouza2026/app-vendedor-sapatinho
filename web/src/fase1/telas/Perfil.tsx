import { Link } from 'react-router-dom';
import { useFase1 } from '../contexto';
import { Avatar, BarraSimples, CabecalhoTela, Painel } from '../componentes/ui';
import { inteiro, mesCurto, plural } from '../formato';
import { Fase1Pagina } from './Fase1Pagina';
import { Reconhecimentos as ListaReconhecimentos } from './Feed';

export function Perfil() {
  const { dados, sair } = useFase1();
  const nivel = dados.nivel;
  const loja = dados.lojas.find((l) => l.id === dados.vendedor.lojaId)!;
  const conquistadas = dados.conquistas.filter((c) => c.conquistadaEm).length;
  const recordePerto = dados.recordes.find((r) => r.atual !== null && r.atual < r.valor && r.atual / r.valor >= 0.8);

  return (
    <Fase1Pagina carregando="Carregando seu perfil...">
      <header className="flex items-center gap-4">
        <Avatar nome={dados.vendedor.nome} destaque tamanho="lg" />
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold text-white">{dados.vendedor.nome}</h1>
          <p className="text-sm text-slate-400">
            {loja.nome} · {dados.vendedor.empresa}
          </p>
          <p className="text-xs text-slate-400">Na equipe desde {mesCurto(dados.vendedor.admitidoEm.slice(0, 7))}</p>
        </div>
      </header>

      <Link to="/progresso" className="block">
        <Painel destaque className="active:opacity-90">
          <div className="flex items-baseline justify-between">
            <p className="text-lg font-bold text-white">⭐ {nivel.nome}</p>
            <p className="text-sm text-slate-400">nível {nivel.nivel}</p>
          </div>
          <div className="mt-2">
            <BarraSimples percentual={nivel.progresso} rotulo="Progresso do nível" cor="sky" />
          </div>
          <p className="mt-1 text-sm text-slate-300">
            {inteiro(dados.xp.total)} XP{nivel.proximo && <> — faltam {inteiro(nivel.faltaXp!)} XP para {nivel.proximo.nome}</>}
          </p>
        </Painel>
      </Link>

      <div className="grid grid-cols-2 gap-3">
        <Link to="/moedas" className="block rounded-2xl border border-slate-700/60 bg-surface p-3 active:opacity-90">
          <p className="text-xs text-slate-400">VendaCoins</p>
          <p className="text-2xl font-bold text-amber-200">🪙 {inteiro(dados.moedas.saldo)}</p>
        </Link>
        <div className="rounded-2xl border border-slate-700/60 bg-surface p-3">
          <p className="text-xs text-slate-400">Sequência</p>
          <p className="text-2xl font-bold text-white">🔥 {dados.sequencia.atual}</p>
          <p className="text-[11px] text-slate-400">recorde: {plural(dados.sequencia.maior, 'dia')}</p>
        </div>
      </div>
      <p className="-mt-2 text-xs text-slate-400">Sequência = {dados.sequencia.criterio}. Abrir o app não conta.</p>

      <nav aria-label="Seu histórico" className="flex flex-col gap-2">
        <ItemMenu para="/conquistas" icone="🏅" titulo="Conquistas" detalhe={`${conquistadas} de ${dados.conquistas.length}`} />
        <ItemMenu para="/recordes" icone="🚀" titulo="Meus recordes" detalhe={recordePerto ? `perto de bater: ${recordePerto.titulo.toLowerCase()}` : `${dados.recordes.length} marcas`} />
        <ItemMenu para="/reconhecimentos" icone="💛" titulo="Reconhecimentos" detalhe={plural(dados.reconhecimentos.length, 'mensagem', 'mensagens')} />
        <ItemMenu para="/feed" icone="📰" titulo="Acontecendo agora" detalhe="novidades das corridas" />
        <ItemMenu para="/perfil/senha" icone="🔒" titulo="Alterar senha" detalhe="encerra suas outras sessões" />
      </nav>

      <button
        onClick={() => sair()}
        className="mt-2 min-h-[48px] rounded-full border border-slate-700 font-medium text-slate-300 active:opacity-80"
      >
        Sair
      </button>
    </Fase1Pagina>
  );
}

function ItemMenu({ para, icone, titulo, detalhe }: { para: string; icone: string; titulo: string; detalhe: string }) {
  return (
    <Link to={para} className="flex min-h-[56px] items-center gap-3 rounded-2xl border border-slate-700/60 bg-surface px-4 active:opacity-90">
      <span aria-hidden="true" className="text-xl">
        {icone}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-white">{titulo}</span>
        <span className="block truncate text-xs text-slate-400">{detalhe}</span>
      </span>
      <span aria-hidden="true" className="text-slate-400">
        →
      </span>
    </Link>
  );
}

export function PaginaReconhecimentos() {
  return (
    <Fase1Pagina carregando="Carregando reconhecimentos...">
      <CabecalhoTela titulo="Reconhecimentos" subtitulo="Mensagens da empresa sobre o seu trabalho." voltar="/perfil" />
      <ListaReconhecimentos />
    </Fase1Pagina>
  );
}
