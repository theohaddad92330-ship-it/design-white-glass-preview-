import { z } from 'zod'

/**
 * LE BUDGET DE FRONTS — UN SEUL CALCUL POUR TOUT LE PRODUIT (#2050.14, #2067).
 *
 * Décision Louis du 18/09/2026 (reprise du lot H26) : il existait DEUX calculs
 * du nombre de fronts tenables. L'audit commercial (`commercial-audit-signals.ts`,
 * jusqu'à 4 fronts, l'érosion CITÉE) et la relecture d'onboarding
 * (`onboarding/audit-readout.ts`, `effortSpread` : plafond 3, un front RETIRÉ
 * par érosion déclarée). Pour un même profil, les deux écrans pouvaient dire 1
 * et 3. C'est le nombre de L'AUDIT qui gagne, et il vit ICI, seul (GA-26) :
 * l'audit et la relecture appellent la MÊME fonction, `frontsBudget`.
 *
 * Pourquoi un module à part, et pas dans `commercial-audit-signals.ts` : la
 * relecture d'onboarding est ré-exportée par `onboarding.ts`, que
 * `profile-questionnaire.ts` importe — et `commercial-audit-signals.ts` importe
 * `profile-questionnaire.ts`. Y loger le calcul aurait créé un cycle
 * d'imports ; une feuille qui ne dépend que de zod n'en crée aucun.
 */

/** Ce que le budget lit — les quatre réponses de temps, et rien d'autre. */
type FrontsBudgetInput = {
  weekly_sales_time_protected?: string | null
  weekly_sales_time_declared?: string | null
  protected_slot_capacity?: string | null
  workload_variability?: string | null
}

const cleanValue = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

// ── #2050.14 — peu de temps ⇒ moins de fronts, pas plus d'outils ────────────

/**
 * #2050.14 — le nombre MAXIMUM de fronts que le temps déclaré permet de tenir.
 *
 * Ce n'est pas une prévision et ce n'est pas un score : c'est un BUDGET, au sens
 * où un plan qui demande plus de fronts que ça ne sera pas tenu. « Aucune heure
 * dans une semaine ordinaire » vaut bien `0` — c'est un zéro DÉCLARÉ par la
 * personne, et il est vrai. « Je ne sais pas » n'est PAS dans cette table :
 * l'absence de mesure n'a pas de budget (GA-18 / GA-19).
 */
export const AUDIT_MAX_FRONTS_BY_WEEKLY_BAND: Readonly<Record<string, number>> = {
  'Aucune heure dans une semaine ordinaire': 0,
  'Moins de 2 heures par semaine': 1,
  '2 à 5 heures par semaine': 1,
  '5 à 10 heures par semaine': 2,
  '10 à 20 heures par semaine': 3,
  'Plus de 20 heures par semaine': 4,
}

/** Les réponses déclarées qui ÉRODENT le créneau — citées, jamais converties en malus. */
export const AUDIT_TIME_EROSION_ANSWERS: readonly string[] = [
  'Je bloque des créneaux mais ils sautent souvent',
  'Je ne bloque pas de créneau, je fais au fil de l’eau',
  'Je ne décide pas de mon agenda',
  'Elle est imprévisible, un imprévu peut manger la semaine',
]

export const auditFrontsBudgetSignalSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('notDeclared') }),
  z.object({
    kind: z.literal('measured'),
    maxFronts: z.number().int().min(0),
    /** La bande VERBATIM d'où le budget est tiré. */
    band: z.string().min(1),
    /** LAQUELLE des questions de temps a servi — les trois états ne se fondent jamais. */
    source: z.enum(['protected', 'declared']),
    erosionRisks: z.array(z.string()),
  }),
])
export type AuditFrontsBudgetSignal = z.infer<typeof auditFrontsBudgetSignalSchema>

export function frontsBudget(input: FrontsBudgetInput): AuditFrontsBudgetSignal {
  // Le temps PROTÉGÉ d'abord : c'est celui qui survit à une semaine ordinaire,
  // donc le seul sur lequel un plan tient. L'ANNONCÉ ne sert qu'à défaut, et sa
  // source est nommée pour que l'écran puisse le dire (#2050.11 / #2050.12).
  const candidates: readonly { source: 'protected' | 'declared'; band: string | null }[] = [
    { source: 'protected', band: cleanValue(input.weekly_sales_time_protected) },
    { source: 'declared', band: cleanValue(input.weekly_sales_time_declared) },
  ]
  const erosionRisks = [cleanValue(input.protected_slot_capacity), cleanValue(input.workload_variability)].filter(
    (answer): answer is string => answer !== null && AUDIT_TIME_EROSION_ANSWERS.includes(answer),
  )

  for (const candidate of candidates) {
    if (candidate.band === null) continue
    const maxFronts = AUDIT_MAX_FRONTS_BY_WEEKLY_BAND[candidate.band]
    // `undefined` couvre « Je ne sais pas » ET toute bande hors catalogue :
    // aucune des deux ne se rapproche de la bande voisine.
    if (maxFronts === undefined) continue
    return { kind: 'measured', maxFronts, band: candidate.band, source: candidate.source, erosionRisks }
  }
  return { kind: 'notDeclared' }
}
