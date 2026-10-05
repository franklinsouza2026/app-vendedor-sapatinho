// Janela de data das consultas incrementais (Linx L2). A janela é ESCOPO da
// consulta (o Microvix exige data_inicial/data_fim em LinxMovimento); o
// incremental é o cursor (timestamp). A janela precisa cobrir todo o período em
// que uma venda ainda pode mudar (cancelamento/devolução dias depois).
//
// Política default é HIPÓTESE ('MES_ANTERIOR': do 1º dia do mês anterior até
// hoje), configurável em ERP_JANELA_REABERTURA até a homologação com a Linx.
import { env } from '../../config';
import { diaLocal, mesAnterior, primeiroDiaDoMes, somarDias } from '../../tempo/dia';
import { JanelaConsulta } from '../../integracoes/erp';

export function janelaDeReabertura(agora: Date, tz: string, politica: string = env.ERP_JANELA_REABERTURA): JanelaConsulta {
  const hoje = diaLocal(agora, tz);
  if (politica === 'MES_ANTERIOR') return { inicio: primeiroDiaDoMes(mesAnterior(hoje.slice(0, 7))), fim: hoje };
  const dias = Number(politica);
  return { inicio: somarDias(hoje, -Math.max(0, dias)), fim: hoje };
}

/** Janela da reconciliação periódica: últimos N dias (inclui hoje). */
export function janelaDeReconciliacao(agora: Date, tz: string, dias: number = env.ERP_RECONCILIACAO_DIAS): JanelaConsulta {
  const hoje = diaLocal(agora, tz);
  return { inicio: somarDias(hoje, -(dias - 1)), fim: hoje };
}

/**
 * Janela do BACKFILL (primeira carga): da data de corte configurada na
 * integração (`configuracao.backfillDesde`, YYYY-MM-DD) ou, sem ela, a mesma
 * da reabertura. Nunca "toda a base" (regra de uso do WebService Microvix).
 */
export function janelaDeBackfill(agora: Date, tz: string, backfillDesde: unknown): JanelaConsulta {
  const padrao = janelaDeReabertura(agora, tz);
  if (typeof backfillDesde !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(backfillDesde)) return padrao;
  const hoje = diaLocal(agora, tz);
  return { inicio: backfillDesde < hoje ? backfillDesde : padrao.inicio, fim: hoje };
}
