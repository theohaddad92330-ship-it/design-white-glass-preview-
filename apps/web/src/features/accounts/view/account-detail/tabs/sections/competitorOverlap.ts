import type { CompetitiveStrategy } from '@bellum/contracts'

export type CompetitorAnswer = NonNullable<CompetitiveStrategy['vs_competitors']>[number]

/**
 * #4323.3 — « ESN déjà en place » (le constat) et « Positionnement » (notre angle) listaient les MÊMES sociétés
 * sous deux titres quand le compte n'a pas de brief : un nom dit deux fois. UNE seule ligne par société (GA-26) :
 * le constat la porte, l'angle de réponse s'y rattache, et « Positionnement » ne garde que les concurrents que
 * le constat ne nomme pas. Rapprochement par nom CONSERVATEUR (accents, casse, espaces) — « Groupe SII » et
 * « SII » restent deux sociétés plutôt qu'une fusion à tort.
 */
export function competitorKey(name: string | null | undefined): string {
  return (name ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ')
}

/** L'angle de réponse écrit pour cette société, `null` quand l'analyse n'en dit rien. */
export function answerForIncumbent(
  incumbentName: string,
  answers: readonly CompetitorAnswer[] | null | undefined,
): CompetitorAnswer | null {
  const key = competitorKey(incumbentName)
  if (!key) return null
  return (
    (answers ?? []).find(
      answer => competitorKey(answer.competitor) === key && (answer.talking_point || answer.differentiator),
    ) ?? null
  )
}

/** Les concurrents que le constat « ESN déjà en place » ne nomme pas déjà. */
export function competitorsBeyondIncumbents<T extends { competitor?: string | null }>(
  competitors: readonly T[],
  incumbentNames: readonly string[],
): T[] {
  const placed = new Set(incumbentNames.map(competitorKey).filter(key => key !== ''))
  return competitors.filter(competitor => !placed.has(competitorKey(competitor.competitor)))
}
