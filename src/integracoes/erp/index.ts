import { ProvedorIntegracao } from '@prisma/client';
import { env } from '../../config';
import { ControladoErpAdapter } from './controlado-adapter';
import { ErpAdapter } from './erp-adapter.interface';
import { LinxErpAdapter } from './linx/linx-client';
import { MockErpAdapter } from './mock-adapter';

/** Adapter por provedor da integração (configurada por empresa no Admin). */
export function adapterDoProvedor(provedor: ProvedorIntegracao): ErpAdapter {
  if (provedor === 'LINX') return new LinxErpAdapter();
  if (provedor === 'MOCK') return new MockErpAdapter();
  return new ControladoErpAdapter(env.ERP_CONTROLADO_DIR);
}

/** Provedores que nunca podem rodar em produção/piloto (dados não reais). */
export const PROVEDORES_SO_DESENVOLVIMENTO: ProvedorIntegracao[] = ['MOCK', 'CONTROLADO'];

export * from './erp-adapter.interface';
