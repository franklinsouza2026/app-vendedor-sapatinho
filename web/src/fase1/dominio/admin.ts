/**
 * Regras de EXIBIÇÃO do Admin da Fase 1: calendário, meta diária, pendências,
 * prontidão, validação antes de publicar e imutabilidade do ciclo de vida.
 *
 * ⚠️ REGRA DE NEGÓCIO AINDA NÃO CONGELADA onde indicado. O objetivo é
 * homologar a experiência; a regra final vai para o backend depois.
 */
import type { CampanhaCad, CompeticaoCad, EstadoDemo, MissaoCad, StatusCiclo, VendedorCad } from '../demo/estado';

// ------------------------------------------------------------------ calendário

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function ehDiaValido(data: Date, estado: EstadoDemo, lojaId: string): boolean {
  if (data.getDay() === 0 && !estado.calendario.abreDomingo) return false;
  const dia = iso(data);
  return !estado.calendario.feriados.some((f) => f.data === dia && (f.lojas === 'TODAS' || f.lojas.includes(lojaId)));
}

/** Dias válidos do mês de referência (YYYY-MM) para a loja. */
export function diasValidosDoMes(referencia: string, estado: EstadoDemo, lojaId: string): string[] {
  const [ano, mes] = referencia.split('-').map(Number);
  const ultimo = new Date(ano, mes, 0).getDate();
  const dias: string[] = [];
  for (let d = 1; d <= ultimo; d++) {
    const data = new Date(ano, mes - 1, d);
    if (ehDiaValido(data, estado, lojaId)) dias.push(iso(data));
  }
  return dias;
}

/** Dias válidos DEPOIS de hoje até o fim do mês. */
export function diasValidosRestantes(agoraIso: string, estado: EstadoDemo, lojaId: string): number {
  const hoje = agoraIso.slice(0, 10);
  return diasValidosDoMes(hoje.slice(0, 7), estado, lojaId).filter((d) => d > hoje).length;
}

export function feriadoHoje(agoraIso: string, estado: EstadoDemo, lojaId: string) {
  const hoje = agoraIso.slice(0, 10);
  return estado.calendario.feriados.find((f) => f.data === hoje && (f.lojas === 'TODAS' || f.lojas.includes(lojaId))) ?? null;
}

// ------------------------------------------------------------------ meta diária

export interface OpcoesMetaDiaria {
  manual: number | null;
  uniforme: number | null;
  diasValidos: number | null;
}

/**
 * Três formas de transformar meta mensal em meta do dia (DECISÃO ABERTA):
 *  - MANUAL: o Admin digita;
 *  - UNIFORME: mensal ÷ dias válidos do mês;
 *  - DIAS_VALIDOS: (mensal − realizado até ontem) ÷ dias válidos restantes, hoje incluso
 *    (meta "viva", que se ajusta ao ritmo).
 */
export function opcoesMetaDiaria(estado: EstadoDemo, vendedorId: string, lojaId: string, agoraIso: string, realizadoAteOntem: number): OpcoesMetaDiaria {
  const meta = estado.metas.individuais[vendedorId];
  if (!meta || meta.mensal === null) return { manual: null, uniforme: null, diasValidos: null };
  const validos = diasValidosDoMes(estado.metas.referencia, estado, lojaId);
  const restantesComHoje = diasValidosRestantes(agoraIso, estado, lojaId) + 1;
  return {
    manual: meta.diariaManual,
    uniforme: validos.length ? Math.round(meta.mensal / validos.length) : null,
    diasValidos: restantesComHoje > 0 ? Math.max(0, Math.round((meta.mensal - realizadoAteOntem) / restantesComHoje)) : null,
  };
}

export function metaDiariaVigente(opcoes: OpcoesMetaDiaria, distribuicao: EstadoDemo['metas']['distribuicao']): number | null {
  if (distribuicao === 'UNIFORME') return opcoes.uniforme;
  if (distribuicao === 'DIAS_VALIDOS') return opcoes.diasValidos;
  return opcoes.manual;
}

// ------------------------------------------------------------------ metas: consistência

export function consistenciaMetasLoja(estado: EstadoDemo, lojaId: string) {
  const loja = estado.lojas.find((l) => l.id === lojaId)!;
  const doLoja = estado.vendedores.filter((v) => v.lojaId === lojaId && v.status !== 'DESLIGADO');
  const soma = doLoja.reduce((a, v) => a + (estado.metas.individuais[v.id]?.mensal ?? 0), 0);
  const semMeta = doLoja.filter((v) => (estado.metas.individuais[v.id]?.mensal ?? null) === null);
  return { metaLoja: loja.metaMes, soma, diferenca: soma - loja.metaMes, semMeta };
}

// ------------------------------------------------------------------ dados

export function minutosDesde(iso: string, agoraIso: string): number {
  return Math.round((new Date(agoraIso).getTime() - new Date(iso).getTime()) / 60000);
}

/** Sync considerado atrasado depois de 90 min (o ERP sincroniza de hora em hora). DECISÃO ABERTA. */
export const LIMITE_SYNC_MIN = 90;

// ------------------------------------------------------------------ ciclo de vida

export const ROTULO_STATUS: Record<StatusCiclo, string> = {
  RASCUNHO: 'Rascunho',
  PROGRAMADA: 'Programada',
  ATIVA: 'Ativa',
  ENCERRADA: 'Encerrada',
  ARQUIVADA: 'Arquivada',
  CANCELADA: 'Cancelada',
};

/**
 * Imutabilidade: depois que começa, regra crítica (período, participantes,
 * métrica, alvo, recompensa) não muda em silêncio. Só cancelar/substituir.
 */
export function regrasEditaveis(status: StatusCiclo): boolean {
  return status === 'RASCUNHO' || status === 'PROGRAMADA';
}

/** Status ao publicar: começa no futuro → PROGRAMADA; senão → ATIVA. */
export function statusAoPublicar(inicioIso: string, agoraIso: string): StatusCiclo {
  return inicioIso > agoraIso ? 'PROGRAMADA' : 'ATIVA';
}

// ------------------------------------------------------------------ validação antes de publicar

export interface ItemValidacao {
  ok: boolean;
  rotulo: string;
  problema?: string;
}

export function validarMissao(m: MissaoCad, estado: EstadoDemo): ItemValidacao[] {
  const precisaProduto = m.tipo === 'PRODUTO_SEMANA' || m.tipo === 'PONTA_ESTOQUE';
  return [
    { ok: m.nome.trim().length >= 3, rotulo: 'Nome', problema: 'Dê um nome com pelo menos 3 letras.' },
    { ok: Boolean(m.inicio && m.fim && m.fim > m.inicio), rotulo: 'Período', problema: 'O fim precisa ser depois do início.' },
    { ok: m.lojas === 'TODAS' || m.lojas.length > 0, rotulo: 'Participantes', problema: 'Escolha ao menos uma loja.' },
    { ok: m.descricao.trim().length >= 5, rotulo: 'Objetivo para o vendedor', problema: 'Escreva o objetivo como o vendedor vai ler.' },
    { ok: m.alvo > 0, rotulo: 'Meta da missão', problema: 'A meta precisa ser maior que zero.' },
    { ok: !precisaProduto || m.produtos.length > 0, rotulo: 'Produtos', problema: 'Este tipo de missão precisa de ao menos um produto.' },
    { ok: m.xp > 0 || m.moedas > 0 || m.premioId !== null, rotulo: 'Recompensa', problema: 'Defina XP, VendaCoins ou um prêmio.' },
    { ok: m.regras.trim().length > 0, rotulo: 'Regra de contagem', problema: 'Explique o que conta para o progresso.' },
    { ok: elegiveisNasLojas(estado, m.lojas) > 0, rotulo: 'Elegibilidade', problema: 'Nenhum vendedor elegível nas lojas escolhidas.' },
  ];
}

export function validarCampanha(c: CampanhaCad, estado: EstadoDemo): ItemValidacao[] {
  const semPremio = c.frentes.filter((f) => !f.premioId);
  const refsQuebradas = c.frentes.filter((f) => f.mecanismo === 'COMPETICAO' && !estado.competicoes.some((x) => x.id === f.refId));
  return [
    { ok: c.nome.trim().length >= 3, rotulo: 'Identidade', problema: 'Dê um nome à campanha.' },
    { ok: Boolean(c.inicio && c.fim && c.fim > c.inicio), rotulo: 'Período', problema: 'O fim precisa ser depois do início.' },
    { ok: c.lojas === 'TODAS' || c.lojas.length > 0, rotulo: 'Participantes', problema: 'Escolha ao menos uma loja.' },
    { ok: c.objetivo.trim().length > 0, rotulo: 'Objetivo', problema: 'Descreva o objetivo da campanha.' },
    { ok: c.frentes.length > 0 && refsQuebradas.length === 0, rotulo: 'Mecânica', problema: c.frentes.length === 0 ? 'Inclua ao menos uma frente.' : `Frente sem competição vinculada: ${refsQuebradas.map((f) => f.titulo).join(', ')}.` },
    { ok: semPremio.length === 0, rotulo: 'Premiação', problema: `Frente sem prêmio: ${semPremio.map((f) => f.titulo).join(', ')}.` },
    { ok: c.regras.trim().length > 0, rotulo: 'Regras', problema: 'Escreva as regras (o que vale, quem participa).' },
    { ok: elegiveisNasLojas(estado, c.lojas) > 0, rotulo: 'Elegibilidade', problema: 'Nenhum vendedor elegível nas lojas escolhidas.' },
  ];
}

export function validarCompeticao(c: CompeticaoCad): ItemValidacao[] {
  return [
    { ok: c.nome.trim().length >= 3, rotulo: 'Nome', problema: 'Dê um nome.' },
    { ok: Boolean(c.inicio && c.fim && c.fim > c.inicio), rotulo: 'Período', problema: 'O fim precisa ser depois do início.' },
    { ok: c.metrica !== null || c.valoresDemo !== null || c.tipo === 'LOJA', rotulo: 'Indicador', problema: 'Escolha o indicador da disputa.' },
    { ok: c.premioIds.length > 0, rotulo: 'Prêmio', problema: 'Vincule ao menos um prêmio.' },
    { ok: c.regra.trim().length > 0, rotulo: 'Regra', problema: 'Explique a regra da disputa.' },
  ];
}

function elegiveisNasLojas(estado: EstadoDemo, lojas: 'TODAS' | string[]): number {
  return estado.vendedores.filter((v) => v.elegivel && v.status === 'ATIVO' && (lojas === 'TODAS' || lojas.includes(v.lojaId))).length;
}

// ------------------------------------------------------------------ pendências e prontidão

export interface Pendencia {
  id: string;
  area: 'Pessoas' | 'Metas' | 'Rankings' | 'Incentivos' | 'Dados';
  texto: string;
  rota: string;
  bloqueiaPiloto: boolean;
}

export function vendedoresAtivos(estado: EstadoDemo): VendedorCad[] {
  return estado.vendedores.filter((v) => v.status === 'ATIVO');
}

export function calcularPendencias(estado: EstadoDemo, agoraIso: string): Pendencia[] {
  const p: Pendencia[] = [];
  const semMeta = estado.vendedores.filter((v) => v.status !== 'DESLIGADO' && (estado.metas.individuais[v.id]?.mensal ?? null) === null);
  if (semMeta.length) p.push({ id: 'sem-meta', area: 'Metas', texto: `${semMeta.length} ${semMeta.length === 1 ? 'vendedor sem meta' : 'vendedores sem meta'}: ${semMeta.map((v) => v.nome.split(' ')[0]).join(', ')}`, rota: '/fase1/admin/metas', bloqueiaPiloto: true });

  for (const l of estado.lojas) {
    const c = consistenciaMetasLoja(estado, l.id);
    if (c.diferenca !== 0) p.push({ id: `meta-loja-${l.id}`, area: 'Metas', texto: `${l.nome}: soma das metas individuais difere da meta da loja`, rota: '/fase1/admin/metas', bloqueiaPiloto: false });
  }

  const vinculos = estado.vendedores.filter((v) => v.status !== 'DESLIGADO' && v.vinculoErp === 'PENDENTE');
  if (vinculos.length) p.push({ id: 'vinculos', area: 'Pessoas', texto: `${vinculos.length} ${vinculos.length === 1 ? 'vínculo com o ERP incompleto' : 'vínculos com o ERP incompletos'}`, rota: '/fase1/admin/vendedores', bloqueiaPiloto: true });

  const pendAtiv = estado.vendedores.filter((v) => v.status === 'PENDENTE');
  if (pendAtiv.length) p.push({ id: 'ativacao', area: 'Pessoas', texto: `${pendAtiv.length} ${pendAtiv.length === 1 ? 'vendedor ainda não ativou o acesso' : 'vendedores ainda não ativaram o acesso'}`, rota: '/fase1/admin/vendedores', bloqueiaPiloto: false });

  for (const c of estado.campanhas.filter((x) => x.status === 'RASCUNHO' || x.status === 'PROGRAMADA' || x.status === 'ATIVA')) {
    if (c.frentes.some((f) => !f.premioId)) p.push({ id: `camp-premio-${c.id}`, area: 'Incentivos', texto: `Campanha “${c.nome}” sem premiação em alguma frente`, rota: `/fase1/admin/campanhas/${c.id}`, bloqueiaPiloto: false });
  }

  for (const l of estado.lojas) {
    if (minutosDesde(l.ultimaSync, agoraIso) > LIMITE_SYNC_MIN) p.push({ id: `sync-${l.id}`, area: 'Dados', texto: `${l.nome} com dado desatualizado (${Math.round(minutosDesde(l.ultimaSync, agoraIso) / 60)} h sem sync)`, rota: '/fase1/admin/saude', bloqueiaPiloto: true });
  }

  if (estado.rankings.lojaXLoja.status === 'AGUARDANDO_REGRA') p.push({ id: 'lxl', area: 'Rankings', texto: 'Ranking Loja × Loja aguardando definição da regra', rota: '/fase1/admin/rankings', bloqueiaPiloto: false });

  return p;
}

export type SituacaoProntidao = 'OK' | 'ATENCAO' | 'BLOQUEIO';

export interface ItemProntidao {
  area: string;
  situacao: SituacaoProntidao;
  detalhe: string;
  rota: string;
}

export function calcularProntidao(estado: EstadoDemo, agoraIso: string): ItemProntidao[] {
  const pend = calcularPendencias(estado, agoraIso);
  const da = (area: Pendencia['area']) => pend.filter((x) => x.area === area);
  const situ = (lista: Pendencia[]): SituacaoProntidao => (lista.some((x) => x.bloqueiaPiloto) ? 'BLOQUEIO' : lista.length ? 'ATENCAO' : 'OK');
  const resumo = (lista: Pendencia[], ok: string) => (lista.length ? lista.map((x) => x.texto).join(' · ') : ok);
  const ativos = vendedoresAtivos(estado).length;
  const missoesAtivas = estado.missoes.filter((m) => m.status === 'ATIVA').length;
  const campanhasAtivas = estado.campanhas.filter((c) => c.status === 'ATIVA').length;
  const premiosOk = estado.premios.length > 0;
  const indicadoresSemFonteAtivos = Object.values(estado.indicadores).filter((i) => i.ativo && i.fonte === 'SEM_FONTE').length;

  return [
    { area: 'Usuários', situacao: situ(da('Pessoas')), detalhe: resumo(da('Pessoas'), `${ativos} vendedores ativos`), rota: '/fase1/admin/vendedores' },
    { area: 'Lojas', situacao: estado.lojas.every((l) => l.status === 'ATIVA') ? 'OK' : 'ATENCAO', detalhe: `${estado.lojas.filter((l) => l.status === 'ATIVA').length} lojas ativas`, rota: '/fase1/admin/lojas' },
    { area: 'Metas', situacao: situ(da('Metas')), detalhe: resumo(da('Metas'), 'Metas do mês cadastradas e consistentes'), rota: '/fase1/admin/metas' },
    { area: 'Rankings', situacao: situ(da('Rankings')), detalhe: resumo(da('Rankings'), 'Rankings configurados'), rota: '/fase1/admin/rankings' },
    { area: 'Indicadores', situacao: indicadoresSemFonteAtivos ? 'BLOQUEIO' : 'OK', detalhe: indicadoresSemFonteAtivos ? 'Há indicador sem fonte confiável ligado para o vendedor' : 'Só indicadores confiáveis aparecem ao vendedor', rota: '/fase1/admin/indicadores' },
    { area: 'Gamificação', situacao: 'OK', detalhe: 'XP, VendaCoins, níveis e conquistas ativos (régua v1)', rota: '/fase1/admin/xp' },
    { area: 'Missões', situacao: missoesAtivas ? 'OK' : 'ATENCAO', detalhe: missoesAtivas ? `${missoesAtivas} missões ativas` : 'Nenhuma missão ativa', rota: '/fase1/admin/missoes' },
    { area: 'Campanhas', situacao: da('Incentivos').length ? 'ATENCAO' : campanhasAtivas ? 'OK' : 'ATENCAO', detalhe: resumo(da('Incentivos'), campanhasAtivas ? `${campanhasAtivas} campanha ativa` : 'Nenhuma campanha ativa'), rota: '/fase1/admin/campanhas' },
    { area: 'Premiações', situacao: premiosOk ? 'OK' : 'ATENCAO', detalhe: `${estado.premios.length} prêmios cadastrados`, rota: '/fase1/admin/premiacoes' },
    { area: 'Dados', situacao: situ(da('Dados')), detalhe: resumo(da('Dados'), 'Todas as lojas sincronizadas'), rota: '/fase1/admin/saude' },
    { area: 'PWA', situacao: 'OK', detalhe: 'Instalável, ícones e manifesto prontos (sem cache de dado autenticado)', rota: '/fase1/admin/prontidao' },
  ];
}
