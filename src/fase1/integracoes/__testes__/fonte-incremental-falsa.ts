// ⚠️ SOMENTE TESTES. Fonte incremental FALSA que imita o comportamento
// DOCUMENTADO do WebService de Saída do Microvix (sem nenhuma suposição de
// payload real): cada registro tem um timestamp (contador crescente, por
// método/escopo); a consulta devolve só timestamp > cursor dentro da janela de
// datas; páginas limitadas. Nunca é importada por código de produção.
import { diaLocal } from '../../../tempo/dia';
import { ConsultaIncremental, ErpAdapter, ErroIntegracao, LoteIncremental, ResultadoTesteConexao } from '../../../integracoes/erp';

export interface RegistroFonte {
  metodo: string;
  escopo: string;
  timestamp: bigint;
  evento: { tipo: string; ocorridoEm: string; [k: string]: unknown };
}

export class FonteIncrementalFalsa implements ErpAdapter {
  readonly provedor = 'LINX' as const;
  registros: RegistroFonte[] = [];
  tamanhoPagina = 1000;
  chamadas = 0;
  /** Falha na próxima chamada (fonte indisponível) — antes de qualquer gravação. */
  falharProximaChamada = false;
  private proximoTs = 1000n;

  /** Acrescenta (ou altera) um registro: como no SQL Server, toda escrita ganha timestamp novo. */
  publicar(metodo: string, escopo: string, evento: RegistroFonte['evento'], timestamp?: bigint) {
    const ts = timestamp ?? this.proximoTs++;
    if (ts >= this.proximoTs) this.proximoTs = ts + 1n;
    this.registros.push({ metodo, escopo, timestamp: ts, evento });
    return ts;
  }

  async buscarEventos(): Promise<unknown[]> {
    throw new ErroIntegracao('fonte incremental: use buscarLote');
  }

  async buscarLote(consulta: ConsultaIncremental): Promise<LoteIncremental> {
    this.chamadas++;
    if (this.falharProximaChamada) {
      this.falharProximaChamada = false;
      throw new ErroIntegracao('Fonte indisponível (simulada).');
    }
    const cursorDe = (metodo: string, escopo: string) => BigInt(consulta.cursores.find((c) => c.metodo === metodo && c.escopo === escopo)?.valor ?? '0');
    const naJanela = (r: RegistroFonte) => {
      const dia = diaLocal(new Date(r.evento.ocorridoEm), 'America/Sao_Paulo');
      return dia >= consulta.janela.inicio && dia <= consulta.janela.fim;
    };
    const candidatos = this.registros
      .filter((r) => consulta.lojasExternas.includes(r.escopo) && r.timestamp > cursorDe(r.metodo, r.escopo) && naJanela(r))
      .sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));
    const pagina = candidatos.slice(0, this.tamanhoPagina);
    const maximos = new Map<string, bigint>();
    for (const r of pagina) {
      const k = `${r.metodo}|${r.escopo}`;
      if (!maximos.has(k) || r.timestamp > maximos.get(k)!) maximos.set(k, r.timestamp);
    }
    return {
      eventos: pagina.map((r) => r.evento),
      cursores: [...maximos.entries()].map(([k, v]) => ({ metodo: k.split('|')[0], escopo: k.split('|')[1], valor: v.toString() })),
      haMais: candidatos.length > pagina.length,
    };
  }

  async testarConexao(): Promise<ResultadoTesteConexao> {
    return { ok: false, mensagem: 'fonte de teste' };
  }
}
