import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConsultaEventosErp, ErpAdapter, ErroIntegracao, ResultadoTesteConexao } from './erp-adapter.interface';

/**
 * Adapter CONTROLADO (provedor CONTROLADO) — para testes de integração e E2E.
 * Prova o caminho completo ERP → contrato → ingestão sem ERP real: o teste
 * deposita arquivos JSON (um array de eventos do contrato cada) em
 * `ERP_CONTROLADO_DIR/<integracaoId>/`, e o adapter os entrega como o ERP
 * entregaria. Reentregar o mesmo arquivo é seguro (ids externos = idempotência).
 *
 * Recusado em produção (src/fase1/integracoes). Nunca lê fora do diretório
 * configurado.
 */
export class ControladoErpAdapter implements ErpAdapter {
  readonly provedor = 'CONTROLADO' as const;

  constructor(private readonly diretorio: string | undefined) {}

  private pasta(integracaoId: string): string {
    if (!this.diretorio) throw new ErroIntegracao('adapter controlado sem ERP_CONTROLADO_DIR configurado');
    if (!/^[0-9a-f-]{36}$/i.test(integracaoId)) throw new ErroIntegracao('integração inválida');
    const pasta = join(this.diretorio, integracaoId);
    mkdirSync(pasta, { recursive: true });
    return pasta;
  }

  async buscarEventos(consulta: ConsultaEventosErp): Promise<unknown[]> {
    const pasta = this.pasta(consulta.integracaoId);
    const eventos: unknown[] = [];
    for (const arquivo of readdirSync(pasta).filter((a) => a.endsWith('.json')).sort()) {
      const conteudo = JSON.parse(readFileSync(join(pasta, arquivo), 'utf8')) as unknown;
      if (!Array.isArray(conteudo)) throw new ErroIntegracao(`arquivo ${arquivo} não é uma lista de eventos`);
      for (const e of conteudo) {
        const quando = typeof e === 'object' && e && 'ocorridoEm' in e ? Date.parse(String((e as { ocorridoEm: unknown }).ocorridoEm)) : NaN;
        // Evento sem data válida é entregue mesmo assim: a validação do contrato o rejeita (e conta como ignorado).
        if (Number.isNaN(quando) || (quando >= consulta.desde.getTime() && quando <= consulta.ate.getTime())) eventos.push(e);
      }
    }
    return eventos;
  }

  async testarConexao(consulta: Omit<ConsultaEventosErp, 'desde' | 'ate'>): Promise<ResultadoTesteConexao> {
    this.pasta(consulta.integracaoId);
    return { ok: true, mensagem: 'Adapter controlado pronto (somente testes).' };
  }
}
