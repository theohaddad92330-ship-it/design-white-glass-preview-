/**
 * #2871 (#2395.1/.5/.11) — LE PLAN GÉNÉRÉ DU COMPTE, lu à UN seul endroit.
 *
 * Le plan de la fiche compte vit dans `accounts.raw_analysis` (phase 4 du
 * pipeline) : ses étapes n'ont PAS de ligne en base tant qu'elles ne sont pas
 * actées. La fiche compte (web) et la projection canonique (API,
 * `GET /accounts/:id/actions`) doivent en lire EXACTEMENT les mêmes étapes, dans
 * le même ordre — d'où ce lecteur partagé (GA-26 : une seule dérivation). Il
 * vivait côté web (`account-detail/helpers/plan.ts`, `planViewData.ts`), qui le
 * ré-exporte désormais d'ici.
 */

/** Une valeur du blob d'analyse ramenée à un texte affichable, sans jamais lever. */
export function safeString(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const labelKey = ['name', 'label', 'title', 'program', 'text', 'value'].find(k => typeof obj[k] === 'string')
    if (labelKey) return obj[labelKey] as string
    const parts = Object.entries(obj)
      .filter(([, v]) => typeof v === 'string' && v)
      .map(([k, v]) => `${k}: ${v as string}`)
    return parts.length > 0 ? parts.join(' · ') : ''
  }
  return String(value)
}

export function safeArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/** Une étape du plan généré, telle que la fiche compte la montre. */
export type GeneratedPlanStep = {
  text: string
  responsable?: string
  outil?: string
  deadline?: string
  kpi?: string
  expectedOutcome?: string
}

/** Une phase du plan généré. `week` est le NUMÉRO affiché (1-based). */
export interface GeneratedPlanPhase {
  week: number
  title: string
  objective?: string
  items: GeneratedPlanStep[]
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

export function normalizePlanWeeks(weeks: unknown): GeneratedPlanPhase[] {
  const raw = Array.isArray(weeks) ? weeks : []
  if (raw.length === 0) return []
  return raw.map((w: unknown, i: number) => {
    const obj = w && typeof w === 'object' ? (w as Record<string, unknown>) : {}
    const title = safeString(obj['title'] ?? obj['name'] ?? obj['timeframe'] ?? `Phase ${i + 1}`)
    const objective = safeString(obj['objective'] ?? obj['goal']) || undefined
    const actionsOrItems = Array.isArray(obj['actions'])
      ? obj['actions']
      : Array.isArray(obj['items'])
        ? obj['items']
        : []
    const items = actionsOrItems.map((a: unknown) => {
      const item = a && typeof a === 'object' ? (a as Record<string, unknown>) : {}
      return {
        text: safeString(item['text'] ?? item['action'] ?? ''),
        responsable:
          safeString(item['responsable'] ?? item['contact'] ?? item['owner'] ?? item['target_contact']) || undefined,
        outil: safeString(item['outil'] ?? item['channel']) || undefined,
        deadline: safeString(item['deadline']) || undefined,
        kpi: safeString(item['kpi'] ?? item['success_metric']) || undefined,
        expectedOutcome:
          safeString(item['expected_outcome'] ?? item['expectedOutcome'] ?? item['expected_impact']) || undefined,
      }
    })
    const week = typeof obj['week'] === 'number' ? obj['week'] : i + 1
    return { week, title, objective, items }
  })
}

/**
 * Où le blob d'analyse range ses phases — les formes successives du pipeline
 * (`plan.actionPlan.phases`, `action_plan.weeks`, `planWeeks`,
 * `planHebdomadaire.weeks`…), dans l'ordre de préférence historique de la fiche.
 */
export function generatedPlanWeeks(raw: Record<string, unknown>): GeneratedPlanPhase[] {
  const plan = readRecord(raw['plan']) ?? raw
  const actionPlan =
    readRecord(plan['actionPlan']) ??
    readRecord(plan['action_plan']) ??
    readRecord(raw['actionPlan']) ??
    readRecord(raw['action_plan']) ??
    plan
  const planHebdoWeeks = readRecord(raw['planHebdomadaire'])?.['weeks']
  return normalizePlanWeeks(actionPlan['phases'] ?? actionPlan['weeks'] ?? raw['planWeeks'] ?? planHebdoWeeks ?? [])
}
