import { z } from 'zod'
import { detectFieldConflict } from './field-conflict.js'
import { isStaleSinceHumanCorrection, type FieldSource } from './provenance.js'

/**
 * #4016.L13 — « FAIT CONFIRMÉ JUSQU'À PREUVE CONTRAIRE » (décision Louis 11/10, lot V10-E 17/10).
 *
 * Un fait confirmé à la main (provenance `human`) n'est JAMAIS écrasé par une source automatique :
 * `decideFieldWrite` refuse déjà l'écriture (`lower_authority`). Mais ce refus était MUET — le
 * fournisseur qui dit autre chose disparaissait sans trace, et le commercial ne savait pas que sa
 * valeur était désormais contestée. Ce module ne change PAS l'arbitre ; il garde la trace du refus :
 *
 *  - le fait confirmé RESTE affiché, tel quel ;
 *  - la contradiction se NOMME à côté, avec sa date (table `field_contradictions`) ;
 *  - une correction humaine POSTÉRIEURE gagne toujours : la contradiction tombe. Le prédicat est
 *    celui du geste « Garder la valeur du CRM » (#4189.9) — {@link isStaleSinceHumanCorrection},
 *    une seule règle, jamais recopiée (GA-26).
 *
 * « Contredit » se décide par {@link detectFieldConflict} (`workspace_override` : la valeur en place
 * est humaine, l'entrante est automatique) — mêmes blancs, même égalité que l'arbitre.
 */

/**
 * Les sources qui peuvent CONTREDIRE un fait confirmé : les sources automatiques qui ont OBSERVÉ
 * leur valeur. Un humain ne contredit pas, il corrige ; une estimation (`inferred`) ne prouve rien,
 * elle ne conteste donc rien. Littéral lu par GA-12 (`field_contradictions_source_check`).
 */
export const FIELD_CONTRADICTION_SOURCES = ['connector', 'pipeline', 'model'] as const
const fieldContradictionSourceSchema = z.enum(FIELD_CONTRADICTION_SOURCES)

/** Une contradiction telle que l'écran la reçoit : la valeur ADVERSE, sa source et sa date. */
export const fieldContradictionSchema = z.object({
  /** Nom du champ côté API (camelCase), comme dans `field_provenance`. */
  field: z.string().min(1),
  /** Ce que la source dit — jamais affiché À LA PLACE du fait confirmé. */
  value: z.string(),
  source: fieldContradictionSourceSchema,
  observedAt: z.string(),
})
export type FieldContradiction = z.infer<typeof fieldContradictionSchema>

/** Vrai quand une source automatique dit autre chose qu'un fait confirmé à la main. */
export function contradictsConfirmedFact(input: {
  field: string
  currentValue: unknown
  currentSource: FieldSource | null
  currentObservedAt: string
  incomingValue: unknown
  incomingSource: FieldSource
  incomingAt: string
}): boolean {
  if (!(FIELD_CONTRADICTION_SOURCES as readonly FieldSource[]).includes(input.incomingSource)) return false
  return detectFieldConflict(input)?.resolvedBy === 'workspace_override'
}

/**
 * Ce qui se montre à côté du fait : la contradiction la plus récente par champ, tant que le champ
 * est toujours confirmé à la main et qu'aucune correction humaine ne l'a suivie.
 */
export function visibleFieldContradictions(
  rows: readonly FieldContradiction[],
  current: Partial<Record<string, { source: FieldSource; observedAt: string }>>,
): FieldContradiction[] {
  const latest = new Map<string, FieldContradiction>()
  for (const row of rows) {
    const seen = latest.get(row.field)
    if (!seen || Date.parse(row.observedAt) > Date.parse(seen.observedAt)) latest.set(row.field, row)
  }
  return [...latest.values()].filter(row => {
    const fact = current[row.field]
    return fact?.source === 'human' && !isStaleSinceHumanCorrection(row.observedAt, fact.observedAt)
  })
}
