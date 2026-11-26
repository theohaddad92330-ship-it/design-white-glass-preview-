import { readSectorLabels } from './discover-autopilot-profile'

type SectorAnswers = Parameters<typeof readSectorLabels>[0]

/**
 * #4973 — les secteurs choisis à l'onboarding (`priority_sectors` puis `target_sectors`), en codes du rail, que
 * Découvrir PROPOSE. Jamais posés en filtre d'office (#4529.1, arrivée neutre) : le rail les offre, l'utilisateur coche.
 * Un secteur déclaré no-go est exclu de la proposition. Rien d'onboardé ⇒ `[]`, rien n'est inventé.
 */
export function onboardingSectorProposal(
  answers:
    | { priority_sectors?: SectorAnswers; target_sectors?: SectorAnswers; no_go_sectors?: SectorAnswers }
    | null
    | undefined,
): string[] {
  if (!answers) return []
  const chosen = [
    ...new Set([
      ...readSectorLabels(answers.priority_sectors).codes,
      ...readSectorLabels(answers.target_sectors).codes,
    ]),
  ]
  const refused = new Set(readSectorLabels(answers.no_go_sectors).codes)
  return chosen.filter(code => !refused.has(code))
}
