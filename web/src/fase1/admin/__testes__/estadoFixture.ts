/** Fixture mínima de EstadoAdmin para testes de interface (nunca entra no bundle). */
import type { EstadoAdmin } from '../tiposAdmin';

export function estadoAdminFixture(sobre: Partial<EstadoAdmin> = {}): EstadoAdmin {
  const agora = '2026-10-04T15:00:00.000Z';
  const base: EstadoAdmin = {
    agora,
    empresa: { id: 'emp-1', nome: 'Sapatinho de Luxo', timezone: 'America/Sao_Paulo' },
    mes: '2026-10',
    vendedores: [
      { id: 'v1', nome: 'Ana Souza', lojaId: 'l1', matricula: '101', status: 'ATIVO', admitidoEm: '2025-01-10', vinculoErp: 'VERIFICADO', elegivel: true, motivoInelegivel: null, excecao: null },
      { id: 'v2', nome: 'Bia Lima', lojaId: 'l1', matricula: '102', status: 'ATIVO', admitidoEm: '2025-03-01', vinculoErp: 'VERIFICADO', elegivel: true, motivoInelegivel: null, excecao: null },
    ],
    lojas: [{ id: 'l1', nome: 'Caruaru', codigo: '01', status: 'ATIVA', ultimaSync: '2026-10-04T14:30:00.000Z', metaMes: 60000 }],
    metas: {
      referencia: '2026-10',
      individuais: {
        v1: { mensal: 30000, diasPrevistos: 25, diaria: 1200 },
        v2: { mensal: 30000, diasPrevistos: 24, diaria: 1250 },
      },
    },
    indicadores: {
      VENDAS: { ativo: true, fonte: 'CONFIAVEL', nota: '' },
      QTD_VENDAS: { ativo: true, fonte: 'CONFIAVEL', nota: '' },
      PARES: { ativo: true, fonte: 'CONFIAVEL', nota: '' },
      TICKET: { ativo: true, fonte: 'CONFIAVEL', nota: '' },
      PA: { ativo: true, fonte: 'CONFIAVEL', nota: '' },
      PERCENTUAL_META: { ativo: true, fonte: 'CONFIAVEL', nota: '' },
      SCORE: { ativo: true, fonte: 'CONFIAVEL', nota: '' },
      EVOLUCAO: { ativo: true, fonte: 'CONFIAVEL', nota: '' },
      CONSISTENCIA: { ativo: true, fonte: 'CONFIAVEL', nota: '' },
      CONVERSAO: { ativo: false, fonte: 'SEM_FONTE', nota: 'Sem fluxo de pessoas.' },
    },
    rankings: { metricasAtivas: ['VENDAS', 'PERCENTUAL_META'], metricaCorrida: 'PERCENTUAL_META', lojaXLoja: { status: 'AGUARDANDO_REGRA', formula: null, lojas: [] } },
    feedTipos: { POSICAO: true, META: true, RECORDE: true, MISSAO: true, CONQUISTA: true, LOJA: true, COMPETICAO: true, RECONHECIMENTO: true },
    produtos: [],
    missoes: [],
    competicoes: [],
    campanhas: [],
    premios: [],
    reconhecimentos: [],
    auditoria: [],
    desempenho: [],
    feedRecente: [],
    lojaXLoja: [],
    gamificacao: {
      regua: { versao: 1, xp: { META_DIARIA_100: 100 }, moedas: { META_DIARIA_100: 50 } },
      niveis: [
        { nivel: 1, nome: 'Bronze', xpMinimo: 0 },
        { nivel: 2, nome: 'Prata', xpMinimo: 500 },
      ],
      movimentacoesXp: [],
      movimentacoesMoedas: [],
      conquistas: [],
    },
  };
  return { ...base, ...sobre };
}
