import { skillSeedRows } from '../skill-seed'
import type { MatchCandidate } from '@bellum/contracts'

/**
 * #4433.8 (recette 23/10) — 189 profils sur 198 « non évaluables » : leur fiche porte une liste libre de
 * compétences (`consultants.stack`) mais aucune ligne `consultant_skills` (import, fiche antérieure au semis).
 * « Non évaluable » ne se dit que quand la donnée MANQUE vraiment : une compétence ÉCRITE sur la fiche est lue,
 * au niveau le plus faible (`declared`, niveau inconnu) — jamais plus qu'une déclaration, donc jamais une preuve.
 * Une ligne typée existante gagne toujours : ce repli ne s'applique qu'à un profil SANS aucune ligne typée.
 */
export function skillsFromStack(stack: readonly string[] | null | undefined): MatchCandidate['skills'] {
  return skillSeedRows(stack).map(row => ({
    term: row.skill,
    label: row.rawLabel ?? row.skill,
    level: 'inconnu',
    source: 'declared' as const,
    proof: null,
    inferred: false,
  }))
}
