import {
  AUTOMATION_TEMPLATES,
  type RoutineKey,
  type AutomationRuleView,
  type AutomationTemplate,
  type RoutineView,
  type WorkflowDefinition,
} from '@bellum/contracts'

/**
 * Lot L-D1 (#4167) — UNE liste, UNE grammaire : « Quand [signal] → alors [action] ».
 *
 * Trois maisons y entrent, aucune ne perd son écran d'origine : les règles neuves
 * (cette table), les routines planifiées (Réglages › Routines) et les workflows
 * d'Action OS. Pur : aucune lecture, aucun texte — l'écran traduit.
 *
 * ⚠️ Une ligne ne porte un compteur que si sa maison sait le COMPTER : seules les
 * règles tiennent un journal des déclenchements. Une routine ou un workflow n'a
 * donc pas de « 0 » à afficher, il a « non mesuré ».
 */

export type AutomationOrigin = AutomationRow['origin']

/**
 * Théo C automations-liste.HT-4 — les automatismes de MISSION, venus de l'ancien écran « Suivi de mission »
 * (retiré, redirigé). Ce sont des routines comme les autres, avec une origine « Missions » dans le filtre :
 * une règle de mission n'est pas un écran à part, c'est une carte parmi les autres.
 */
export const MISSION_ROUTINE_KEYS: readonly RoutineKey[] = [
  'timesheet_chase',
  'invoice_readiness',
  'mission_ending',
  'margin_alert',
]

export function isMissionRoutine(routine: RoutineView): boolean {
  return MISSION_ROUTINE_KEYS.includes(routine.definition.key)
}

export type AutomationRow =
  | { origin: 'rule'; id: string; enabled: boolean; rule: AutomationRuleView }
  | { origin: 'routine'; id: string; enabled: boolean; routine: RoutineView }
  | { origin: 'mission'; id: string; enabled: boolean; routine: RoutineView }
  | { origin: 'workflow'; id: string; enabled: boolean; workflow: WorkflowDefinition }

const ORIGIN_RANK: Record<AutomationRow['origin'], number> = { rule: 0, routine: 1, mission: 2, workflow: 3 }

export function buildAutomationRows(input: {
  rules: readonly AutomationRuleView[]
  routines: readonly RoutineView[]
  workflows: readonly WorkflowDefinition[]
}): AutomationRow[] {
  const rows: AutomationRow[] = [
    ...input.rules.map(
      (rule): AutomationRow => ({ origin: 'rule', id: `rule:${rule.id}`, enabled: rule.enabled, rule }),
    ),
    ...input.routines.map(
      (routine): AutomationRow => ({
        origin: isMissionRoutine(routine) ? 'mission' : 'routine',
        id: `routine:${routine.definition.key}`,
        enabled: routine.subscription.status === 'active',
        routine,
      }),
    ),
    ...input.workflows.map(
      (workflow): AutomationRow => ({
        origin: 'workflow',
        id: `workflow:${workflow.key}`,
        enabled: workflow.enabled,
        workflow,
      }),
    ),
  ]
  // Tri stable : les lignes actives d'abord, puis les règles avant les routines avant les workflows.
  return rows
    .map((row, index) => ({ row, index }))
    .sort(
      (a, b) =>
        Number(b.row.enabled) - Number(a.row.enabled) ||
        ORIGIN_RANK[a.row.origin] - ORIGIN_RANK[b.row.origin] ||
        a.index - b.index,
    )
    .map(({ row }) => row)
}

/** Multi-sélection (décision Louis 23/10) : aucune origine cochée = toutes les lignes. */
export function filterRows(rows: readonly AutomationRow[], origins: readonly AutomationOrigin[]): AutomationRow[] {
  return origins.length === 0 ? [...rows] : rows.filter(row => origins.includes(row.origin))
}

/** Le compteur à afficher : `null` = non mesuré, jamais « 0 » (gardes GA-18 / GA-19). */
export function countLabel(count: number | null): { kind: 'count'; value: number } | { kind: 'unmeasured' } {
  return count === null ? { kind: 'unmeasured' } : { kind: 'count', value: count }
}

/** Les modèles pas encore installés : même signal ET même séquence = déjà là. */
export function templatesToOffer(rules: readonly AutomationRuleView[]): AutomationTemplate[] {
  return AUTOMATION_TEMPLATES.filter(
    template =>
      !rules.some(
        rule =>
          rule.signal === template.signal &&
          rule.action_kind === 'enroll_sequence' &&
          rule.playbook_key === template.playbook,
      ),
  )
}
