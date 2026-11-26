import type { AccountOwner, SprintDecisionFields, SprintLevel } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

export interface SprintBoardAccount {
  id: string
  company_name: string
  sprint: SprintLevel
  sprint_entered_at: string | null
  sprint_exit_reason: string | null
  priority_score: number | null
  commercial_status: string | null
  /** #1318 — de quoi reconnaître l'entreprise sans la lire. */
  logo_url: string | null
  website: string | null
  /** #1318.3 — la dernière fois que quelque chose a bougé sur ce compte. */
  updated_at: string | null
  /** #3509 — dernier mouvement tracé, même source que « sans mouvement » (/pilotage). */
  last_activity_at?: string | null
  /**
   * #1318.3 — rien n'est programmé sur ce compte.
   *
   * Le fait qui compte le plus pour arbitrer : un compte en priorité forte sur
   * lequel rien n'est prévu est exactement ce qu'on cherche à voir. Calculé par
   * le prédicat d'hygiène du module comptes, jamais réécrit ici.
   */
  without_next_action: boolean
  /** BEL-SC-228 (#3257) — la décision générique attachée au niveau. */
  sprint_reason: string | null
  sprint_effort_estimate: string | null
  sprint_review_at: string | null
  sprint_promotion_condition: string | null
  sprint_demotion_condition: string | null
  /** #3257.7a — LE PORTEUR du compte. `null` = personne ne le porte (compte
   *  libre), une vraie réponse — jamais deviné. */
  owner: AccountOwner | null
  /** #3257.7b — la prochaine tâche ouverte à venir (titre + échéance), `null` = rien de programmé. */
  next_task_title: string | null
  next_task_due_on: string | null
  /** #3257.4 — le partenaire lié (`account_partners`), `null` = à désigner. */
  partner_name: string | null
  /** #3296 (#3269.6) — la PROPOSITION lue depuis `partner_name`, jamais
   *  écrite : `null` si aucune règle ne s'applique (déjà en route partenaire,
   *  ou aucun partenaire lié). */
  suggested_switch: { to: SprintLevel; reason: string } | null
}

/** #3296 — un compte de l'espace sans niveau posé. */
interface SprintUnplacedAccount {
  id: string
  company_name: string
  logo_url: string | null
  website: string | null
  priority_score: number | null
}

/** `unplaced` (#3296) et `focus_capacity` (#3407, plafond du Focus de l'espace) : absents d'une API antérieure. */
type SprintBoard = Record<SprintLevel, SprintBoardAccount[]> & {
  unplaced?: SprintUnplacedAccount[]
  focus_capacity?: number
}

export const SPRINT_BOARD_KEY = ['sprints', 'board'] as const

export async function fetchSprintBoard(): Promise<SprintBoard> {
  return apiFetch<SprintBoard>({ path: '/sprints' })
}

export async function moveAccountToSprint(
  accountId: string,
  sprint: SprintLevel,
  reason: string | null,
  decision: Partial<SprintDecisionFields> = {},
): Promise<SprintBoardAccount> {
  return apiFetch<SprintBoardAccount>({
    path: `/sprints/accounts/${accountId}`,
    method: 'PATCH',
    body: {
      sprint,
      reason,
      decisionReason: decision.reason,
      effortEstimate: decision.effortEstimate,
      reviewAt: decision.reviewAt,
      promotionCondition: decision.promotionCondition,
      demotionCondition: decision.demotionCondition,
    },
  })
}
