import { z } from 'zod'
import type { ToolDailyCapVerdict } from './tool-daily-cap.js'

/**
 * LA PORTE DE COÛT PAR ESPACE — #2440 / épopée #2975.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI MANQUAIT
 * ─────────────────────────────────────────────────────────────────────────
 * Le ledger (`credit_ledger`) et le registre de coût réel (`provider_costs`)
 * existent depuis longtemps, et une alerte GLOBALE à l'exploitant tourne déjà
 * chaque matin (`CostAlertService`, seuil `COST_ALERT_DAILY_USD`). Ce qui
 * n'existait pas : un contrôle PAR ESPACE, réglable par un admin, capable de
 * BLOQUER une action avant qu'elle ne coûte — pas seulement de le signaler le
 * lendemain.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TROIS RÈGLES REPRISES DU RESTE DU DÉPÔT
 * ─────────────────────────────────────────────────────────────────────────
 * 1. **Sans réglage, la porte ne fait RIEN** — les trois plafonds sont
 *    `null` par défaut, exactement comme `COST_ALERT_DAILY_USD` absent. Un
 *    plafond à `0` ou négatif est traité comme non réglé : une saisie
 *    aberrante ne doit jamais bloquer un espace entier par accident.
 * 2. **Le message NOMME la bonne limite** (#2440.87) — jamais un « budget
 *    dépassé » générique : `workspace_budget`, `member_cap` ou `action_cap`,
 *    pour que qui le lit sache LAQUELLE lever.
 * 3. **Le coût ne s'agrège jamais entre espaces (GA-43).** `PeriodSpendUsd`
 *    est un instantané déjà scopé à UN espace ; cette fonction ne lit ni
 *    n'écrit rien — c'est à l'appelant de ne jamais lui passer un total
 *    mélangé entre deux espaces.
 *
 * `estimatedCostUsd` est le coût ATTENDU de l'action sur le point de
 * s'exécuter : la porte compare le dépassement PROJETÉ (déjà dépensé +
 * cette action), pas seulement le passé — c'est ce qui la rend un vrai
 * GATE et non une alerte a posteriori.
 */

export const BUDGET_LIMIT_NAMES = ['workspace_budget', 'member_cap', 'action_cap'] as const
export const budgetLimitNameSchema = z.enum(BUDGET_LIMIT_NAMES)
export type BudgetLimitName = (typeof BUDGET_LIMIT_NAMES)[number]

/** Les cinq leviers admin de #2440.83-89. `null` = ce plafond n'est pas réglé. */
export const workspaceBudgetLeversSchema = z.object({
  /** Budget mensuel de l'espace, en dollars. */
  monthlyBudgetUsd: z.number().positive().nullable(),
  /** Plafond individuel par membre, en dollars. */
  perMemberCapUsd: z.number().positive().nullable(),
  /** Plafond par action, en dollars. */
  perActionCapUsd: z.number().positive().nullable(),
  /** Un dépassement (sans bloquer) déclenche-t-il une alerte back-office ? */
  alertOnOverage: z.boolean(),
  /** Bloque-t-on l'action au-delà du plafond, ou se contente-t-on d'alerter ? */
  blockAtCap: z.boolean(),
})
export type WorkspaceBudgetLevers = z.infer<typeof workspaceBudgetLeversSchema>

/** Ce que l'espace, ce membre et cette action ont déjà coûté sur la période en
 *  cours — TOUJOURS scopé à un seul espace (GA-43). */
export type PeriodSpendUsd = {
  workspaceUsd: number
  memberUsd: number
  actionUsd: number
}

export type BudgetGateVerdict =
  | { allowed: true; overCap: null }
  | { allowed: true; overCap: BudgetLimitName; alert: boolean }
  | { allowed: false; overCap: BudgetLimitName; message: string }
  // #2440.45 — la limite PAR OUTIL (`tool-daily-cap.ts`), rendue par la même porte.
  | Extract<ToolDailyCapVerdict, { allowed: false }>

/** Un plafond réglé et positif, ou `null` — une saisie à 0 ou négative ne
 *  compte pas comme un réglage. */
function isSetCap(capUsd: number | null): capUsd is number {
  return capUsd != null && Number.isFinite(capUsd) && capUsd > 0
}

const CHECKS: { name: BudgetLimitName; message: string }[] = [
  { name: 'workspace_budget', message: 'Le budget mensuel de cet espace est atteint.' },
  { name: 'member_cap', message: 'Le plafond individuel de ce membre est atteint.' },
  { name: 'action_cap', message: 'Le plafond réservé à cette action est atteint.' },
]

function capFor(levers: WorkspaceBudgetLevers, name: BudgetLimitName): number | null {
  switch (name) {
    case 'workspace_budget':
      return levers.monthlyBudgetUsd
    case 'member_cap':
      return levers.perMemberCapUsd
    case 'action_cap':
      return levers.perActionCapUsd
  }
}

function spendFor(spend: PeriodSpendUsd, name: BudgetLimitName): number {
  switch (name) {
    case 'workspace_budget':
      return spend.workspaceUsd
    case 'member_cap':
      return spend.memberUsd
    case 'action_cap':
      return spend.actionUsd
  }
}

/**
 * La porte elle-même. Vérifie les trois plafonds dans l'ORDRE — le budget de
 * l'espace d'abord, le plus englobant, puis le membre, puis l'action — et
 * s'arrête à la PREMIÈRE limite dépassée : nommer trois limites à la fois
 * n'aiderait personne à savoir laquelle lever en premier.
 */
export function checkBudgetGate(
  levers: WorkspaceBudgetLevers,
  spend: PeriodSpendUsd,
  estimatedCostUsd: number,
): BudgetGateVerdict {
  for (const check of CHECKS) {
    const capUsd = capFor(levers, check.name)
    if (!isSetCap(capUsd)) continue

    const projectedUsd = spendFor(spend, check.name) + estimatedCostUsd
    if (projectedUsd <= capUsd) continue

    if (levers.blockAtCap) return { allowed: false, overCap: check.name, message: check.message }
    return { allowed: true, overCap: check.name, alert: levers.alertOnOverage }
  }

  return { allowed: true, overCap: null }
}
