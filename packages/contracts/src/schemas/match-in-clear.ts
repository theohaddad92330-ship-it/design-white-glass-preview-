import { z } from 'zod'
import { matchAxisSchema, type MatchAxis, type MatchAxisResult } from './match.js'

/**
 * Refonte Théo — décision Louis (23/10) : la correspondance consultant ↔ besoin
 * s'écrit EN CLAIR, « Correspond : … · Manque : … », jamais en points.
 *
 * Lue sur les axes que le moteur a DÉJÀ écrits (`match_run_entries.axes`) —
 * aucun second calcul, aucun seuil inventé :
 *  - un axe de compétences nomme ses compétences (les preuves couvertes, la
 *    liste « manque … » de son détail, et « à vérifier … » à part) ;
 *  - tout autre axe : 100 correspond, 0 manque, entre les deux « en partie »,
 *    `null` (non évaluable) reste à confirmer — un inconnu ne devient pas un non.
 */
export const matchInClearSchema = z.object({
  correspondsSkills: z.array(z.string()),
  correspondsAxes: z.array(matchAxisSchema),
  partialAxes: z.array(matchAxisSchema),
  lacksSkills: z.array(z.string()),
  lacksAxes: z.array(matchAxisSchema),
  toConfirmSkills: z.array(z.string()),
  toConfirmAxes: z.array(matchAxisSchema),
})
export type MatchInClear = z.infer<typeof matchInClearSchema>

const SKILL_AXES: readonly MatchAxis[] = ['must_have', 'nice_to_have']

/** Les morceaux du détail d'un axe de compétences (`skillAxis`, moteur de rapprochement). */
function listAfter(detail: string, marker: string): string[] {
  const start = detail.indexOf(marker)
  if (start === -1) return []
  const rest = detail.slice(start + marker.length)
  const end = rest.indexOf(' — ')
  return (end === -1 ? rest : rest.slice(0, end))
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

export function matchInClear(
  axes: readonly Pick<MatchAxisResult, 'axis' | 'score' | 'detail' | 'evidence'>[],
): MatchInClear {
  const clear: MatchInClear = {
    correspondsSkills: [],
    correspondsAxes: [],
    partialAxes: [],
    lacksSkills: [],
    lacksAxes: [],
    toConfirmSkills: [],
    toConfirmAxes: [],
  }
  for (const axis of axes) {
    if (SKILL_AXES.includes(axis.axis)) {
      if (axis.score === null) continue // le besoin ne déclare aucune compétence de ce rang : rien à dire.
      const covered = axis.evidence.map(item => item.label.split(' — ')[0].trim()).filter(Boolean)
      const missing = listAfter(axis.detail, '— manque ')
      const unverified = listAfter(axis.detail, '— à vérifier : ')
      clear.correspondsSkills.push(...covered)
      clear.lacksSkills.push(...missing)
      clear.toConfirmSkills.push(...unverified)
      // Rien de nommable alors que l'axe n'est pas plein : on nomme l'axe plutôt que de se taire.
      if (axis.score < 100 && missing.length === 0 && unverified.length === 0) clear.lacksAxes.push(axis.axis)
      continue
    }
    if (axis.score === null) clear.toConfirmAxes.push(axis.axis)
    else if (axis.score >= 100) clear.correspondsAxes.push(axis.axis)
    else if (axis.score <= 0) clear.lacksAxes.push(axis.axis)
    else clear.partialAxes.push(axis.axis)
  }
  return clear
}
