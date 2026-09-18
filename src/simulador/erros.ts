// Erro de domínio do Simulador, extraído de `session.service.ts` na Fatia 9.7
// para que `scenario.service.ts` também possa lançá-lo sem import circular.
//
// Motivo concreto: `resolverCenario` lançava `Error` cru quando o cenário era
// incompatível com o papel de quem pediu, e isso virava 500 em vez do 404
// genérico que a regra de isolamento exige (nunca revelar a um vendedor que um
// cenário gerencial existe, e vice-versa).
export type SimulationErrorType =
  | 'not_found'
  | 'message_too_long'
  | 'rate_limited'
  | 'budget_exceeded'
  | 'generation_in_progress'
  | 'invalid_state'
  | 'provider_unavailable';

export class SimulationError extends Error {
  constructor(
    public type: SimulationErrorType,
    message: string
  ) {
    super(message);
  }
}
