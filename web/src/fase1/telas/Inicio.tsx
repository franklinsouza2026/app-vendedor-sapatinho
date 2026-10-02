/**
 * Home da Fase 1 — responde em 5–10 segundos:
 * como estou hoje → qual o próximo alvo → como estou no mês → minha posição →
 * o que posso conquistar → o que está acontecendo.
 */
import { Link } from 'react-router-dom';
import { useFase1 } from '../demo/Fase1Contexto';
import { derivarAlvos } from '../dominio/alvos';
import { priorizarAlvos, vocePerto } from '../dominio/proximoAlvo';
import { calcularNivel } from '../dominio/niveis';
import { CardMetaHoje, CardMissao, CorridaMes, MinhaCorrida, ProximoAlvo, VocePerto } from '../componentes/blocos';
import { Painel, TituloSecao } from '../componentes/ui';
import { dataPorExtenso, haQuanto, hora, inteiro, saudacao, tempoRestante } from '../formato';
import { Fase1Pagina } from './Fase1Pagina';

export function Inicio() {
  return (
    <Fase1Pagina carregando="Carregando seu dia...">
      <ConteudoInicio />
    </Fase1Pagina>
  );
}

function ConteudoInicio() {
  const { dados } = useFase1();
  const nivel = calcularNivel(dados.xp.total);
  const loja = dados.lojas.find((l) => l.id === dados.vendedor.lojaId)!;
  const alvos = priorizarAlvos(derivarAlvos(dados));
  const principal = alvos[0] ?? null;
  const perto = vocePerto(alvos, 2);
  const operando = !dados.status.diaDeFolga && !dados.status.lojaFechada;
  // Em folga/loja fechada, missão diária não aparece: nada de cobrança em dia sem expediente.
  const missoesAbertas = dados.missoes.filter((m) => !m.concluidaEm && (operando || m.tipo !== 'DIARIA')).slice(0, 2);

  return (
    <>
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          {saudacao(dados.agora)}, {dados.vendedor.primeiroNome} <span aria-hidden="true">👋</span>
        </h1>
        <p className="text-sm text-slate-400">{dataPorExtenso(dados.agora)}</p>
        <p className="text-sm text-slate-400">
          {dados.vendedor.empresa} • {loja.nome}
        </p>
        <nav aria-label="Seu progresso" className="mt-3 flex flex-wrap gap-2">
          <Link to="/fase1/progresso" className="flex min-h-[40px] items-center gap-1.5 rounded-full bg-surface px-3 text-sm ring-1 ring-slate-700">
            <span aria-hidden="true">⭐</span>
            <span className="font-semibold text-white">{nivel.nome}</span>
            <span className="text-slate-400">· nível {nivel.nivel}</span>
          </Link>
          <Link to="/fase1/progresso" className="flex min-h-[40px] items-center gap-1.5 rounded-full bg-surface px-3 text-sm ring-1 ring-slate-700">
            <span className="font-semibold text-white">{inteiro(dados.xp.total)}</span>
            <span className="text-slate-400">XP</span>
          </Link>
          <Link to="/fase1/moedas" className="flex min-h-[40px] items-center gap-1.5 rounded-full bg-surface px-3 text-sm ring-1 ring-slate-700">
            <span aria-hidden="true">🪙</span>
            <span className="font-semibold text-white">{inteiro(dados.moedas.saldo)}</span>
            <span className="sr-only">VendaCoins</span>
          </Link>
        </nav>
      </header>

      {/* Quando o Próximo Alvo É a meta do dia, o próprio card de meta assume o
          selo — repetir "R$ 486 para bater a meta" num segundo card é ruído. */}
      <CardMetaHoje dados={dados} ehProximoAlvo={operando && principal?.id === 'meta-dia'} />

      {operando && principal && principal.id !== 'meta-dia' && <ProximoAlvo alvo={principal} />}
      {operando && <VocePerto alvos={perto} />}

      <CorridaMes dados={dados} />

      <MinhaCorrida dados={dados} />

      {missoesAbertas.length > 0 && (
        <section aria-labelledby="missoes-home">
          <TituloSecao acao={{ para: '/fase1/desafios', texto: 'Todas' }}>
            <span id="missoes-home">Suas missões</span>
          </TituloSecao>
          <div className="flex flex-col gap-3">
            {missoesAbertas.map((m) => (
              <CardMissao key={m.id} missao={m} />
            ))}
          </div>
        </section>
      )}

      {dados.campanha && (
        <Link to="/fase1/desafios?aba=campanha" className="block">
          <Painel className="flex items-center gap-3 active:opacity-90">
            <span aria-hidden="true" className="text-3xl">
              🏁
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-accentSoft">Campanha</p>
              <p className="font-semibold text-white">{dados.campanha.nome}</p>
              <p className="text-sm text-slate-400">
                {dados.campanha.frentes.length} formas de ganhar · {tempoRestante(dados.campanha.terminaEm, dados.agora)}
              </p>
            </div>
            <span aria-hidden="true" className="text-slate-400">
              →
            </span>
          </Painel>
        </Link>
      )}

      {dados.feed.length > 0 && (
        <section aria-labelledby="feed-home">
          <TituloSecao acao={{ para: '/fase1/feed', texto: 'Ver tudo' }}>
            <span id="feed-home">Acontecendo agora</span>
          </TituloSecao>
          <Painel>
            <ul className="flex flex-col divide-y divide-slate-700/60">
              {dados.feed.slice(0, 3).map((e) => (
                <li key={e.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span aria-hidden="true" className="text-lg">
                    {e.icone}
                  </span>
                  <span className={`flex-1 text-sm ${e.meu ? 'font-medium text-white' : 'text-slate-300'}`}>{e.texto}</span>
                  <span className="shrink-0 text-xs text-slate-400">{haQuanto(e.quando, dados.agora)}</span>
                </li>
              ))}
            </ul>
          </Painel>
        </section>
      )}

      <p className="text-center text-xs text-slate-400">
        {dados.status.sincronizadoEm ? `Dados do ERP de ${hora(dados.status.sincronizadoEm)} · atualiza a cada hora` : 'Ainda sem sincronização do ERP hoje.'}
      </p>
    </>
  );
}
