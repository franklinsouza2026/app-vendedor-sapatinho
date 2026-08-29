import { ErpAdapter } from './erp-adapter.interface';
import { MockErpAdapter } from './mock-adapter';
import { LinxErpAdapter } from './linx/linx-client';
import { env } from '../../config';

export const erpAdapter: ErpAdapter = env.ERP_MODE === 'linx' ? new LinxErpAdapter() : new MockErpAdapter();

export type { ErpAdapter, IndicadorErp } from './erp-adapter.interface';
