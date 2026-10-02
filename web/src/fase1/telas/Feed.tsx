/**
 * Acontecendo agora — feed de fatos do jogo. NÃO é rede social: sem
 * comentários, curtidas, postagem livre ou chat. Reconhecimentos ficam em aba
 * própria (na Fase 1, quem reconhece é o Admin).
 */
import { useState } from 'react';
import { useFase1 } from '../demo/Fase1Contexto';
import { Abas, CabecalhoTela, Painel, Vazio } from '../componentes/ui';
import { dataCurta, haQuanto } from '../formato';
import { Fase1Pagina } from './Fase1Pagina';

export function Feed() {
  const { dados } = useFase1();
  const [aba, setAba] = useState<'feed' | 'reconhecimentos'>('feed');
  return (
    <Fase1Pagina carregando="Carregando novidades...">
      <CabecalhoTela titulo="Acontecendo agora" subtitulo="O que mudou nas corridas e competições." voltar="/fase1/inicio" />
      <Abas<'feed' | 'reconhecimentos'>
        rotulo="Novidades"
        ativa={aba}
        onTrocar={setAba}
        abas={[
          { id: 'feed', rotulo: 'Novidades' },
          { id: 'reconhecimentos', rotulo: `Reconhecimentos · ${dados.reconhecimentos.length}` },
        ]}
      />
      {aba === 'feed' &&
        (dados.feed.length === 0 ? (
          <Vazio icone="📰" titulo="Tudo calmo por enquanto" texto="Mudanças de posição, metas batidas e recordes aparecem aqui." />
        ) : (
          <ul className="flex flex-col gap-2">
            {dados.feed.map((e) => (
              <li key={e.id} className={`flex items-start gap-3 rounded-xl px-3 py-3 ${e.meu ? 'bg-accent/10 ring-1 ring-accent/30' : 'bg-surface'}`}>
                <span aria-hidden="true" className="text-xl">
                  {e.icone}
                </span>
                <span className={`flex-1 text-sm ${e.meu ? 'font-medium text-white' : 'text-slate-200'}`}>{e.texto}</span>
                <span className="shrink-0 text-xs text-slate-400">{haQuanto(e.quando, dados.agora)}</span>
              </li>
            ))}
          </ul>
        ))}
      {aba === 'reconhecimentos' && <Reconhecimentos />}
    </Fase1Pagina>
  );
}

export function Reconhecimentos() {
  const { dados } = useFase1();
  if (dados.reconhecimentos.length === 0) {
    return <Vazio icone="💛" titulo="Nenhum reconhecimento ainda" texto="Quando a empresa reconhecer o seu trabalho, a mensagem fica guardada aqui." />;
  }
  return (
    <ul className="flex flex-col gap-3">
      {dados.reconhecimentos.map((r) => (
        <li key={r.id}>
          <Painel as="article" className="!border-amber-300/25">
            <p className="text-xs text-slate-400">
              {r.autor} · {dataCurta(r.quando)}
            </p>
            <h2 className="mt-1 font-semibold text-white">💛 {r.titulo}</h2>
            <p className="mt-1 text-sm text-slate-300">{r.mensagem}</p>
          </Painel>
        </li>
      ))}
    </ul>
  );
}
