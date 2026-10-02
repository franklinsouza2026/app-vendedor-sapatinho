import { useState } from 'react';
import { useFase1 } from '../demo/Fase1Contexto';
import type { Conquista } from '../dominio/tipos';
import { Abas, AvisoProvisorio, BarraSimples, CabecalhoTela, Pilula, Vazio } from '../componentes/ui';
import { dataCurta } from '../formato';
import { Fase1Pagina } from './Fase1Pagina';

export function Conquistas() {
  const { dados } = useFase1();
  const [aba, setAba] = useState<'feitas' | 'proximas'>('feitas');
  const feitas = dados.conquistas.filter((c) => c.conquistadaEm);
  // "A conquistar": as que têm progresso primeiro (mais perto), depois as demais.
  const proximas = dados.conquistas.filter((c) => !c.conquistadaEm).sort((a, b) => (b.progresso ?? -1) - (a.progresso ?? -1));
  const lista = aba === 'feitas' ? feitas : proximas;
  return (
    <Fase1Pagina carregando="Carregando conquistas...">
      <CabecalhoTela titulo="Conquistas" subtitulo={`${feitas.length} de ${dados.conquistas.length} conquistadas`} voltar="/fase1/perfil" />
      <Abas<'feitas' | 'proximas'>
        rotulo="Conquistas"
        ativa={aba}
        onTrocar={setAba}
        abas={[
          { id: 'feitas', rotulo: `Conquistadas · ${feitas.length}` },
          { id: 'proximas', rotulo: `A conquistar · ${proximas.length}` },
        ]}
      />
      {lista.length === 0 ? (
        <Vazio icone="🏅" titulo={aba === 'feitas' ? 'Sua primeira conquista está perto' : 'Você conquistou tudo!'} texto={aba === 'feitas' ? 'Bata a meta do dia para ganhar a badge “Primeira Meta”.' : 'Novas conquistas chegam com as próximas campanhas.'} />
      ) : (
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {lista.map((c) => (
            <CartaoConquista key={c.codigo} c={c} />
          ))}
        </ul>
      )}
      <AvisoProvisorio>Badges marcadas “proposta” ainda não existem no catálogo do backend (badges.service.ts).</AvisoProvisorio>
    </Fase1Pagina>
  );
}

function CartaoConquista({ c }: { c: Conquista }) {
  const feita = Boolean(c.conquistadaEm);
  return (
    <li className={`flex flex-col rounded-2xl border p-3 ${feita ? 'border-amber-300/30 bg-gradient-to-b from-amber-400/10 to-surface' : 'border-slate-700/60 bg-surface'}`}>
      <span aria-hidden="true" className={`text-3xl ${feita ? '' : 'opacity-40 grayscale'}`}>
        {c.icone}
      </span>
      <p className="mt-1 text-sm font-semibold text-white">{c.titulo}</p>
      <p className="text-xs text-slate-400">{c.descricao}</p>
      <div className="mt-auto pt-2">
        {feita ? (
          <p className="text-xs text-amber-200">✓ {dataCurta(c.conquistadaEm!)}</p>
        ) : (
          <>
            {c.progresso !== undefined && <BarraSimples percentual={c.progresso} rotulo={`Progresso em ${c.titulo}`} />}
            {c.falta && <p className="mt-1 text-xs text-slate-300">{c.falta}</p>}
          </>
        )}
        {c.origem === 'PROPOSTA' && (
          <span className="mt-1 inline-block">
            <Pilula tom="info">proposta</Pilula>
          </span>
        )}
      </div>
    </li>
  );
}
