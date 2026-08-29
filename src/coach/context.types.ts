// CoachContext — seção 5 da fonte de verdade. Estrutura mínima e explícita
// entregue ao provider de IA. Nomes de campo em inglês conforme especificado
// na fonte de verdade; nunca inclui objetos ORM inteiros, hash, token, ID
// desnecessário ou dado de outro vendedor/tenant.
export type BaselineStatus = 'disponivel' | 'em_formacao';

export interface CoachContext {
  seller: {
    displayName: string;
  };
  store: {
    name: string;
  };
  goal: {
    todayGoal: number | null;
    realized: number;
    goalPercent: number | null;
    amountRemaining: number | null;
    estimatedSalesRemaining: number | null;
  };
  performance: {
    ticket: number;
    pa: number;
    salesCount: number;
  };
  baseline: {
    ticket: number | null;
    pa: number | null;
    status: BaselineStatus;
  };
  gamification: {
    xp: number;
    level: string;
    streak: number;
    recentBadges: string[];
  };
  development: {
    currentFocus: string | null;
    currentMission: string | null;
    recentTrainings: string[];
    professionalMemorySummary: string | null;
  };
  freshness: {
    lastDataSyncAt: string | null; // ISO — null quando o vendedor nunca teve indicador sincronizado
  };
}
