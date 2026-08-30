// Nenhum provider é instanciado aqui como singleton global — desde a Fatia
// 7.5B, resolver QUAL provider usar (e com qual credencial/modelo) é
// responsabilidade exclusiva do AIGateway (`../gateway.service`), nunca de
// um import direto. Isso torna estruturalmente impossível um especialista
// novo "esquecer" de passar pelo Gateway: não existe mais um atalho aqui.
export type { AIProvider, AIMessage, GenerateResponseInput, GenerateResponseResult } from './ai-provider.interface';
export { AIProviderError } from './ai-provider.interface';
