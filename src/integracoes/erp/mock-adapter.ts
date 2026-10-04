import { createHash } from 'node:crypto';
import { prisma } from '../../db';
import { diaLocal, instanteDoDia, listarDias, TZ_PADRAO } from '../../tempo/dia';
import { ConsultaEventosErp, ErpAdapter, EventoErp, ResultadoTesteConexao } from './erp-adapter.interface';

/**
 * Adapter de DESENVOLVIMENTO (provedor MOCK). Gera vendas determinísticas para
 * os VENDEDORES já cadastrados nas lojas vinculadas — nunca para ADMIN/GERENTE
 * (Fatia 9.7). Recusado em produção (src/fase1/integracoes). Mesmo instante →
 * mesmos eventos, com os mesmos ids: reprocessar nunca duplica (idempotência
 * do contrato).
 *
 * Perfil: 3 a 9 vendas por dia, entre 10h e 21h locais, itens de um catálogo
 * FICTÍCIO marcado com o prefixo "DEMO-". ~4% das vendas são canceladas 20 min
 * depois — para que o fluxo de cancelamento também seja exercitado em DEV.
 */
const CATALOGO_DEMO = [
  { referencia: 'DEMO-1001', descricao: 'Scarpin Demo Nude', categoria: 'Salto', preco: 289.9, pares: 1 },
  { referencia: 'DEMO-1002', descricao: 'Sandália Demo Preta', categoria: 'Salto', preco: 249.9, pares: 1 },
  { referencia: 'DEMO-2001', descricao: 'Rasteira Demo Caramelo', categoria: 'Rasteira', preco: 129.9, pares: 1 },
  { referencia: 'DEMO-3001', descricao: 'Bolsa Demo Tiracolo', categoria: 'Bolsa', preco: 349.9, pares: 0 },
  { referencia: 'DEMO-4001', descricao: 'Tênis Demo Branco', categoria: 'Tênis', preco: 259.9, pares: 1 },
];

export class MockErpAdapter implements ErpAdapter {
  readonly provedor = 'MOCK' as const;

  async buscarEventos(consulta: ConsultaEventosErp): Promise<EventoErp[]> {
    const tz = (await prisma.empresa.findUnique({ where: { id: consulta.empresaId }, select: { timezone: true } }))?.timezone ?? TZ_PADRAO;
    const vinculos = await prisma.integracaoLoja.findMany({ where: { integracaoId: consulta.integracaoId, codigoExterno: { in: consulta.lojasExternas } } });
    const eventos: EventoErp[] = [];

    for (const vinculo of vinculos) {
      const vendedores = await prisma.vendedor.findMany({ where: { lojaId: vinculo.lojaId, status: 'ACTIVE', papel: 'VENDEDOR' }, select: { matriculaErp: true } });
      for (const dia of listarDias(diaLocal(consulta.desde, tz), diaLocal(consulta.ate, tz))) {
        const meiaNoite = instanteDoDia(dia, tz).getTime();
        for (const v of vendedores) {
          for (const evento of eventosDoDia(vinculo.codigoExterno, v.matriculaErp, dia, meiaNoite)) {
            const quando = new Date(evento.ocorridoEm).getTime();
            if (quando >= consulta.desde.getTime() && quando <= consulta.ate.getTime()) eventos.push(evento);
          }
        }
      }
    }
    return eventos;
  }

  async testarConexao(): Promise<ResultadoTesteConexao> {
    return { ok: true, mensagem: 'Mock de desenvolvimento — sempre disponível (não usar em piloto).' };
  }
}

/** Eventos de um vendedor num dia — função pura e determinística (testada). */
export function eventosDoDia(loja: string, matricula: string, dia: string, meiaNoiteLocal: number): EventoErp[] {
  const base = `${loja}:${matricula}:${dia}`;
  const quantidade = 3 + Math.floor(pseudoAleatorio(`${base}:qtd`) * 7);
  const eventos: EventoErp[] = [];
  for (let n = 0; n < quantidade; n++) {
    const minutos = 10 * 60 + Math.floor((n + pseudoAleatorio(`${base}:${n}:min`)) * ((11 * 60) / quantidade));
    const ocorridoEm = new Date(meiaNoiteLocal + minutos * 60_000);
    const qtdItens = 1 + Math.floor(pseudoAleatorio(`${base}:${n}:itens`) * 3);
    const itens = Array.from({ length: qtdItens }, (_, i) => {
      const produto = CATALOGO_DEMO[Math.floor(pseudoAleatorio(`${base}:${n}:${i}:p`) * CATALOGO_DEMO.length)];
      return { referencia: produto.referencia, descricao: produto.descricao, categoria: produto.categoria, quantidade: 1, pares: produto.pares, valor: produto.preco };
    });
    const idVenda = `MOCK-${base}-${n}`;
    eventos.push({ tipo: 'VENDA', idExterno: idVenda, lojaExterna: loja, vendedorExterno: matricula, ocorridoEm: ocorridoEm.toISOString(), valor: Math.round(itens.reduce((a, i) => a + i.valor, 0) * 100) / 100, itens });
    if (pseudoAleatorio(`${base}:${n}:cancela`) < 0.04) {
      eventos.push({ tipo: 'CANCELAMENTO', idExterno: `${idVenda}-CANC`, vendaIdExterno: idVenda, ocorridoEm: new Date(ocorridoEm.getTime() + 20 * 60_000).toISOString() });
    }
  }
  return eventos;
}

/** Hash estável → [0,1). Determinístico entre processos e execuções (ao contrário de Math.random). */
function pseudoAleatorio(chave: string): number {
  const hash = createHash('sha256').update(chave).digest();
  return hash.readUInt32BE(0) / 0xffffffff;
}
