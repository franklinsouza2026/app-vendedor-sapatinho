/**
 * Regras de EXIBIÇÃO da central do Admin (pendências, prontidão, rótulos).
 * Tudo é derivado do estado REAL vindo do servidor; nenhuma regra de negócio
 * (meta, posição, prêmio, validade de publicação) é decidida aqui — a
 * validação "antes de publicar" vem do próprio servidor (endpoints /validar).
 */
import type { CampanhaCad, EstadoAdmin, StatusCiclo, VendedorCad } from '../admin/tiposAdmin';

export interface ItemValidacao {
  ok: boolean;
  rotulo: string;
  problema?: string;
}

/** Sync considerado atrasado depois de 90 min (mesmo limite da Saúde dos Dados no servidor). */
export const LIMITE_SYNC_MIN = 90;

export function minutosDesde(iso: string, agoraIso: string): number {
  return Math.round((new Date(agoraIso).getTime() - new Date(iso).getTime()) / 60000);
}

export const ROTULO_STATUS: Record<StatusCiclo, string> = {
  RASCUNHO: 'Rascunho',
  PROGRAMADA: 'Programada',
  ATIVA: 'Ativa',
  ENCERRADA: 'Encerrada',
  ARQUIVADA: 'Arquivada',
  CANCELADA: 'Cancelada',
};

/**
 * Imutabilidade (o servidor também recusa): depois que começa, regra crítica
 * não muda em silêncio. Só cancelar/substituir.
 */
export function regrasEditaveis(status: StatusCiclo): boolean {
  return status === 'RASCUNHO' || status === 'PROGRAMADA';
}

export function consistenciaMetasLoja(estado: EstadoAdmin, lojaId: string) {
  const loja = estado.lojas.find((l) => l.id === lojaId);
  const doLoja = estado.vendedores.filter((v) => v.lojaId === lojaId && v.status !== 'DESLIGADO');
  const soma = doLoja.reduce((a, v) => a + (estado.metas.individuais[v.id]?.mensal ?? 0), 0);
  const semMeta = doLoja.filter((v) => (estado.metas.individuais[v.id]?.mensal ?? null) === null);
  const semDias = doLoja.filter((v) => (estado.metas.individuais[v.id]?.diasPrevistos ?? null) === null);
  const metaLoja = loja?.metaMes ?? null;
  return { metaLoja, soma, diferenca: metaLoja === null ? 0 : soma - metaLoja, semMeta, semDias };
}

export interface Pendencia {
  id: string;
  area: 'Pessoas' | 'Metas' | 'Rankings' | 'Incentivos' | 'Dados';
  texto: string;
  rota: string;
  bloqueiaPiloto: boolean;
}

export function vendedoresAtivos(estado: EstadoAdmin): VendedorCad[] {
  return estado.vendedores.filter((v) => v.status === 'ATIVO');
}

const primeiros = (vs: VendedorCad[]) => vs.map((v) => v.nome.split(' ')[0]).join(', ');

export function calcularPendencias(estado: EstadoAdmin): Pendencia[] {
  const p: Pendencia[] = [];
  const naoDesligados = estado.vendedores.filter((v) => v.status !== 'DESLIGADO');
  const semMeta = naoDesligados.filter((v) => (estado.metas.individuais[v.id]?.mensal ?? null) === null);
  if (semMeta.length) p.push({ id: 'sem-meta', area: 'Metas', texto: `${semMeta.length} ${semMeta.length === 1 ? 'vendedor sem meta do mês' : 'vendedores sem meta do mês'}: ${primeiros(semMeta)}`, rota: '/admin/metas', bloqueiaPiloto: true });
  const semDias = naoDesligados.filter((v) => (estado.metas.individuais[v.id]?.diasPrevistos ?? null) === null);
  if (semDias.length) p.push({ id: 'sem-dias', area: 'Metas', texto: `${semDias.length} ${semDias.length === 1 ? 'vendedor sem dias de trabalho previstos' : 'vendedores sem dias de trabalho previstos'} (sem eles não há meta do dia): ${primeiros(semDias)}`, rota: '/admin/metas', bloqueiaPiloto: true });

  for (const l of estado.lojas.filter((x) => x.status === 'ATIVA')) {
    const c = consistenciaMetasLoja(estado, l.id);
    if (c.metaLoja !== null && c.diferenca !== 0) p.push({ id: `meta-loja-${l.id}`, area: 'Metas', texto: `${l.nome}: soma das metas individuais difere da meta da loja`, rota: '/admin/metas', bloqueiaPiloto: false });
  }

  const vinculos = naoDesligados.filter((v) => v.vinculoErp === 'PENDENTE' && v.status === 'ATIVO');
  if (vinculos.length) p.push({ id: 'vinculos', area: 'Pessoas', texto: `${vinculos.length} ${vinculos.length === 1 ? 'vendedor ainda sem venda recebida do ERP' : 'vendedores ainda sem venda recebida do ERP'} (confira a matrícula): ${primeiros(vinculos)}`, rota: '/admin/vendedores', bloqueiaPiloto: false });

  const pendAtiv = estado.vendedores.filter((v) => v.status === 'PENDENTE');
  if (pendAtiv.length) p.push({ id: 'ativacao', area: 'Pessoas', texto: `${pendAtiv.length} ${pendAtiv.length === 1 ? 'vendedor ainda não ativou o acesso' : 'vendedores ainda não ativaram o acesso'}`, rota: '/admin/vendedores', bloqueiaPiloto: false });

  for (const c of estado.campanhas.filter((x) => x.status === 'RASCUNHO' || x.status === 'PROGRAMADA' || x.status === 'ATIVA')) {
    if (c.frentes.some((f) => !f.premioId)) p.push({ id: `camp-premio-${c.id}`, area: 'Incentivos', texto: `Campanha “${c.nome}” sem premiação em alguma frente`, rota: `/admin/campanhas/${c.id}`, bloqueiaPiloto: false });
  }

  for (const l of estado.lojas.filter((x) => x.status === 'ATIVA')) {
    if (!l.ultimaSync) p.push({ id: `sync-${l.id}`, area: 'Dados', texto: `${l.nome} ainda não recebeu dados do ERP (integração não vinculada ou sem sincronização)`, rota: '/admin/integracoes', bloqueiaPiloto: true });
    else if (minutosDesde(l.ultimaSync, estado.agora) > LIMITE_SYNC_MIN) p.push({ id: `sync-${l.id}`, area: 'Dados', texto: `${l.nome} com dado desatualizado (${Math.round(minutosDesde(l.ultimaSync, estado.agora) / 60)} h sem sync)`, rota: '/admin/saude', bloqueiaPiloto: true });
  }

  if (estado.rankings.lojaXLoja.status === 'AGUARDANDO_REGRA' && estado.lojas.filter((l) => l.status === 'ATIVA').length > 1) p.push({ id: 'lxl', area: 'Rankings', texto: 'Ranking Loja × Loja aguardando definição da regra', rota: '/admin/rankings', bloqueiaPiloto: false });

  return p;
}

export type SituacaoProntidao = 'OK' | 'ATENCAO' | 'BLOQUEIO';

export interface ItemProntidao {
  area: string;
  situacao: SituacaoProntidao;
  detalhe: string;
  rota: string;
}

export function calcularProntidao(estado: EstadoAdmin): ItemProntidao[] {
  const pend = calcularPendencias(estado);
  const da = (area: Pendencia['area']) => pend.filter((x) => x.area === area);
  const situ = (lista: Pendencia[]): SituacaoProntidao => (lista.some((x) => x.bloqueiaPiloto) ? 'BLOQUEIO' : lista.length ? 'ATENCAO' : 'OK');
  const resumo = (lista: Pendencia[], ok: string) => (lista.length ? lista.map((x) => x.texto).join(' · ') : ok);
  const ativos = vendedoresAtivos(estado).length;
  const missoesAtivas = estado.missoes.filter((m) => m.status === 'ATIVA').length;
  const campanhasAtivas = estado.campanhas.filter((c: CampanhaCad) => c.status === 'ATIVA').length;
  const indicadoresSemFonteAtivos = Object.values(estado.indicadores).filter((i) => i.ativo && i.fonte === 'SEM_FONTE').length;

  return [
    { area: 'Usuários', situacao: ativos === 0 ? 'BLOQUEIO' : situ(da('Pessoas')), detalhe: ativos === 0 ? 'Nenhum vendedor ativo' : resumo(da('Pessoas'), `${ativos} vendedores ativos`), rota: '/admin/vendedores' },
    { area: 'Lojas', situacao: estado.lojas.some((l) => l.status === 'ATIVA') ? 'OK' : 'BLOQUEIO', detalhe: `${estado.lojas.filter((l) => l.status === 'ATIVA').length} lojas ativas`, rota: '/admin/lojas' },
    { area: 'Metas', situacao: situ(da('Metas')), detalhe: resumo(da('Metas'), 'Metas e dias de trabalho do mês cadastrados'), rota: '/admin/metas' },
    { area: 'Rankings', situacao: situ(da('Rankings')), detalhe: resumo(da('Rankings'), 'Rankings configurados'), rota: '/admin/rankings' },
    { area: 'Indicadores', situacao: indicadoresSemFonteAtivos ? 'BLOQUEIO' : 'OK', detalhe: indicadoresSemFonteAtivos ? 'Há indicador sem fonte confiável ligado para o vendedor' : 'Só indicadores com fonte aparecem ao vendedor', rota: '/admin/indicadores' },
    { area: 'Gamificação', situacao: 'OK', detalhe: `XP, VendaCoins, níveis e conquistas ativos (régua v${estado.gamificacao.regua.versao})`, rota: '/admin/xp' },
    { area: 'Missões', situacao: missoesAtivas ? 'OK' : 'ATENCAO', detalhe: missoesAtivas ? `${missoesAtivas} missões ativas` : 'Nenhuma missão ativa', rota: '/admin/missoes' },
    { area: 'Campanhas', situacao: da('Incentivos').length ? 'ATENCAO' : campanhasAtivas ? 'OK' : 'ATENCAO', detalhe: resumo(da('Incentivos'), campanhasAtivas ? `${campanhasAtivas} campanha ativa` : 'Nenhuma campanha ativa'), rota: '/admin/campanhas' },
    { area: 'Premiações', situacao: estado.premios.length ? 'OK' : 'ATENCAO', detalhe: `${estado.premios.length} prêmios cadastrados`, rota: '/admin/premiacoes' },
    { area: 'Dados de venda', situacao: situ(da('Dados')), detalhe: resumo(da('Dados'), 'Todas as lojas sincronizadas'), rota: '/admin/saude' },
    { area: 'PWA', situacao: 'OK', detalhe: 'Instalável, ícones e manifesto prontos (sem cache de dado autenticado)', rota: '/admin/prontidao' },
  ];
}
