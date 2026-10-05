/**
 * Configurações → Integrações (T1/T2/T3/T6). Uma integração por provedor e
 * empresa; lojas vinculadas pelo código da loja no ERP. A credencial é
 * write-only: o servidor guarda cifrada e devolve só a versão mascarada.
 * LINX aparece como "preparada": estrutura pronta, conexão real fica para a
 * etapa de Integração Linx (nada é chamado daqui).
 */
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { haQuanto } from '../formato';
import { atualizarIntegracao, criarIntegracao, definirCredencial, desvincularLoja, listarIntegracoes, sincronizarAgora, statusIntegracao, testarIntegracao, vincularLoja, type IntegracaoAdmin } from './api';
import { mensagemDeErro, useAdmin } from './AdminDados';
import { Bloco, Botao, Campo, Feedback, INPUT, Selo, TituloPagina } from './ui';

const PROVEDORES: { id: IntegracaoAdmin['provedor']; nome: string; descricao: string; preparada?: boolean }[] = [
  { id: 'LINX', nome: 'Linx', descricao: 'ERP oficial das lojas. Estrutura pronta — a conexão real será ativada na etapa de Integração Linx.', preparada: true },
  { id: 'CONTROLADO', nome: 'Arquivo controlado', descricao: 'Eventos de venda em arquivos JSON numa pasta do servidor. Para homologação e testes de ponta a ponta.' },
  { id: 'MOCK', nome: 'Simulador (desenvolvimento)', descricao: 'Gera vendas determinísticas. Recusado pelo servidor em produção.' },
];

const ROTULO_STATUS: Record<IntegracaoAdmin['status'], { texto: string; tom: 'ok' | 'aviso' | 'neutro' }> = {
  ATIVA: { texto: '🟢 Ativa', tom: 'ok' },
  CONFIGURANDO: { texto: '🟡 Configurando', tom: 'aviso' },
  DESATIVADA: { texto: '⚪ Desativada', tom: 'neutro' },
};

export function Integracoes() {
  const { estado, recarregar } = useAdmin();
  const [lista, setLista] = useState<IntegracaoAdmin[] | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      setLista((await listarIntegracoes()).integracoes);
    } catch (e) {
      setFeedback(mensagemDeErro(e));
    }
  }, []);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function rodar(acao: () => Promise<unknown>, ok: string | ((r: unknown) => string)) {
    try {
      const r = await acao();
      setFeedback(typeof ok === 'function' ? ok(r) : ok);
      await carregar();
      await recarregar();
    } catch (e) {
      setFeedback(mensagemDeErro(e));
    }
  }

  const naoConfigurados = PROVEDORES.filter((p) => !lista?.some((i) => i.provedor === p.id));

  return (
    <>
      <TituloPagina titulo="Integrações" descricao="De onde vêm as vendas. Credenciais ficam cifradas no servidor e nunca voltam para a tela." />
      <Feedback texto={feedback} />
      {lista === null ? (
        <p className="text-sm text-slate-400">Carregando…</p>
      ) : (
        <>
          {lista.map((i) => (
            <CartaoIntegracao key={i.id} integracao={i} lojas={estado.lojas.filter((l) => l.status === 'ATIVA')} rodar={rodar} />
          ))}
          {naoConfigurados.length > 0 && (
            <Bloco titulo="Adicionar integração">
              <ul className="grid gap-3 md:grid-cols-3">
                {naoConfigurados.map((p) => (
                  <li key={p.id} className="flex flex-col gap-2 rounded-xl bg-slate-800/70 p-3 text-sm">
                    <span className="font-semibold text-white">
                      {p.nome} {p.preparada && <Selo tom="info">preparada</Selo>}
                    </span>
                    <span className="text-slate-400">{p.descricao}</span>
                    <div className="mt-auto">
                      <Botao onClick={() => void rodar(() => criarIntegracao(p.id, {}), `Integração ${p.nome} criada em configuração.`)}>Configurar</Botao>
                    </div>
                  </li>
                ))}
              </ul>
            </Bloco>
          )}
        </>
      )}
    </>
  );
}

function CartaoIntegracao({ integracao: i, lojas, rodar }: { integracao: IntegracaoAdmin; lojas: { id: string; nome: string; codigoErp?: string | null }[]; rodar: (a: () => Promise<unknown>, ok: string | ((r: unknown) => string)) => Promise<void> }) {
  const prov = PROVEDORES.find((p) => p.id === i.provedor)!;
  const [credencial, setCredencial] = useState('');
  const [urlBase, setUrlBase] = useState(i.configuracao.urlBase ?? '');
  const [portal, setPortal] = useState(i.configuracao.portal ? String(i.configuracao.portal) : '');
  const [codigos, setCodigos] = useState<Record<string, string>>(() => Object.fromEntries(i.lojas.map((l) => [l.lojaId, l.codigoExterno])));
  const st = ROTULO_STATUS[i.status];

  function enviarCredencial(e: FormEvent) {
    e.preventDefault();
    if (credencial.length < 8) return;
    const valor = credencial;
    setCredencial('');
    void rodar(() => definirCredencial(i.id, valor), 'Credencial substituída. Ela fica cifrada; a tela mostra só a versão mascarada.');
  }

  return (
    <Bloco titulo={prov.nome}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Selo tom={st.tom}>{st.texto}</Selo>
        {prov.preparada && <Selo tom="info">preparada — conexão real na etapa Linx</Selo>}
        {i.provedor === 'LINX' && !i.credencialDefinida && <Selo tom="aviso">NÃO TESTADO / AGUARDANDO CREDENCIAL</Selo>}
        <span className="text-xs text-slate-400">
          Última sincronização com sucesso: {i.ultimaSyncSucessoEm ? haQuanto(i.ultimaSyncSucessoEm, new Date().toISOString()) : 'nunca'} · Última venda recebida: {i.ultimaVendaEm ? haQuanto(i.ultimaVendaEm, new Date().toISOString()) : 'nenhuma'}
        </span>
      </div>
      <p className="mt-2 text-sm text-slate-400">{prov.descricao}</p>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          {i.provedor === 'LINX' && (
            <form
              className="grid gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const numeroPortal = portal.trim() ? Number(portal.trim()) : undefined;
                void rodar(() => atualizarIntegracao(i.id, { ...i.configuracao, urlBase: urlBase.trim() || undefined, portal: numeroPortal }), 'Configuração salva.');
              }}
            >
              <Campo rotulo="Portal Microvix (IdPortal)" ajuda="Número do portal informado pela Linx na ativação do WebService. Não é segredo.">
                <input className={INPUT} inputMode="numeric" pattern="[0-9]*" value={portal} onChange={(e) => setPortal(e.target.value.replace(/\D/g, ''))} placeholder="Ex.: 12345" />
              </Campo>
              <Campo rotulo="Endereço do serviço (URL base)" ajuda="Somente HTTPS.">
                <input className={INPUT} value={urlBase} onChange={(e) => setUrlBase(e.target.value)} placeholder="https://" />
              </Campo>
              <div>
                <Botao type="submit">Salvar configuração</Botao>
              </div>
            </form>
          )}
          {i.provedor !== 'MOCK' && (
            <form className="grid gap-2" onSubmit={enviarCredencial}>
              <Campo rotulo="Credencial" ajuda={i.credencialDefinida ? `Atual: ${i.credencial ?? '••••'} (definida ${i.credencialAtualizadaEm ? haQuanto(i.credencialAtualizadaEm, new Date().toISOString()) : ''}). Digite uma nova para substituir.` : 'Nenhuma credencial definida.'}>
                <input type="password" autoComplete="new-password" className={INPUT} value={credencial} onChange={(e) => setCredencial(e.target.value)} minLength={8} placeholder={i.credencialDefinida ? 'Substituir credencial' : 'Informar credencial'} />
              </Campo>
              <div>
                <Botao type="submit" disabled={credencial.length < 8}>
                  {i.credencialDefinida ? 'Substituir credencial' : 'Salvar credencial'}
                </Botao>
              </div>
            </form>
          )}
          <div className="flex flex-wrap gap-2">
            <Botao onClick={() => void rodar(() => testarIntegracao(i.id), (r) => (r as { mensagem: string }).mensagem)}>Testar conexão</Botao>
            {i.status === 'ATIVA' && <Botao onClick={() => void rodar(() => sincronizarAgora(i.id), 'Sincronização solicitada. Acompanhe em Saúde dos dados.')}>Sincronizar agora</Botao>}
            {i.status !== 'ATIVA' ? (
              <Botao tipo="primario" onClick={() => void rodar(() => statusIntegracao(i.id, 'ATIVA'), 'Integração ativada.')}>
                Ativar
              </Botao>
            ) : (
              <Botao tipo="perigo" onClick={() => void rodar(() => statusIntegracao(i.id, 'DESATIVADA'), 'Integração desativada. As vendas já recebidas continuam valendo.')}>
                Desativar
              </Botao>
            )}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-slate-200">Lojas vinculadas (código da loja no ERP)</p>
          {lojas.length === 0 ? (
            <p className="text-sm text-slate-400">Nenhuma loja ativa.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {lojas.map((l) => {
                const vinculo = i.lojas.find((x) => x.lojaId === l.id);
                return (
                  <li key={l.id} className="flex flex-col gap-2 rounded-xl bg-slate-800/70 p-3 text-sm sm:flex-row sm:items-center">
                    <span className="flex-1 text-white">
                      {l.nome} {vinculo ? <Selo tom="ok">vinculada</Selo> : <Selo tom="aviso">sem vínculo</Selo>}
                    </span>
                    <label className="sm:w-40">
                      <span className="sr-only">Código de {l.nome} no ERP</span>
                      <input className={INPUT} value={codigos[l.id] ?? ''} onChange={(e) => setCodigos({ ...codigos, [l.id]: e.target.value })} placeholder="Código no ERP" />
                    </label>
                    <div className="flex gap-2">
                      <Botao disabled={!(codigos[l.id] ?? '').trim() || codigos[l.id] === vinculo?.codigoExterno} onClick={() => void rodar(() => vincularLoja(i.id, l.id, codigos[l.id].trim()), `${l.nome} vinculada.`)}>
                        Vincular
                      </Botao>
                      {vinculo && (
                        <Botao tipo="fantasma" onClick={() => void rodar(() => desvincularLoja(i.id, l.id), `${l.nome} desvinculada.`)}>
                          Desvincular
                        </Botao>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </Bloco>
  );
}
