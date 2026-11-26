import type { BudgetGateVerdict } from '@bellum/contracts'

/**
 * La porte de coût par espace (#2975), par JETON — même patron que
 * `DECISION_QUEUE_CREDIT_CAPACITY`/`client-health-tokens.ts` (`modules/admin/`).
 *
 * GA-07 compte tout import `../<module>/<fichier>.service` depuis un SERVICE
 * d'un autre module. Un appelant (`CreditsService`) qui importerait
 * directement `WorkspaceBudgetService` paierait ce compteur pour un
 * couplage que le jeton évite : la composition (lier le jeton au service
 * réel) se fait dans `workspace-budget.module.ts`, la couche que la garde
 * exempte précisément parce que c'est le point prévu pour ça.
 */
export type BudgetGateChecker = (
  workspaceId: string,
  actorUserId: string,
  actionKey: string,
  estimatedCostUsd: number,
) => Promise<BudgetGateVerdict>

export const WORKSPACE_BUDGET_GATE = Symbol('WORKSPACE_BUDGET_GATE')
