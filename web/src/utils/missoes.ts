import { TipoAcaoMissao } from '../types';

/**
 * Resolve a rota segura pra CTA de uma missão a partir do `actionType`
 * estruturado do backend — nunca uma URL livre vinda de qualquer lugar
 * (seção 17 da Fatia 7).
 */
export function rotaDaAcaoMissao(actionType: TipoAcaoMissao): string {
  switch (actionType) {
    case 'COACH':
      return '/coach';
    case 'TRAINER':
      return '/treinador';
    case 'SIMULATOR':
      return '/simulador';
    case 'ACADEMY':
      return '/academia';
    case 'PERFORMANCE':
      return '/metas';
  }
}
