import type { MatchAxis, MatchInClear } from '@bellum/contracts'

/**
 * Refonte Théo (décision Louis, 23/10) — la correspondance consultant ↔ besoin, en MOTS :
 * « Correspond : … · En partie : … · Manque : … · À confirmer : … ». Jamais un point, jamais un
 * pourcentage. Une rubrique vide ne s'écrit pas ; rien du tout → `null` (l'appelant dit « pas encore
 * rapproché », il ne devine pas).
 */
export function matchInClearLabel(
  clear: MatchInClear,
  axisLabel: (axis: MatchAxis) => string,
  rubric: (key: 'corresponds' | 'partial' | 'lacks' | 'toConfirm', list: string) => string,
): string | null {
  const parts: [Parameters<typeof rubric>[0], string[]][] = [
    ['corresponds', [...clear.correspondsSkills, ...clear.correspondsAxes.map(axisLabel)]],
    ['partial', clear.partialAxes.map(axisLabel)],
    ['lacks', [...clear.lacksSkills, ...clear.lacksAxes.map(axisLabel)]],
    ['toConfirm', [...clear.toConfirmSkills, ...clear.toConfirmAxes.map(axisLabel)]],
  ]
  const written = parts.filter(([, items]) => items.length > 0).map(([key, items]) => rubric(key, items.join(', ')))
  return written.length === 0 ? null : written.join(' · ')
}
