import type { TodayItem } from './todayQueue'

/**
 * Théo C actions-aujourdhui.N2 — l'ÉTAT d'une ligne de la file : « Non commencée · En cours · À valider ».
 *
 * Un état DÉRIVÉ, jamais une colonne : la file ne porte que ce qui attend encore un geste. « Terminées » n'est
 * pas un état de la file — c'est le tiroir « Historique » — et « Toutes » est l'absence de filtre.
 *  - « À valider » : ce qui attend un feu vert (le geste valider, ou le groupe de validation) ;
 *  - « En cours » : un brouillon est déjà préparé — préparer ne clôture pas, la tâche reste ouverte ;
 *  - « Non commencée » : tout le reste.
 */
export type TodayStateKey = 'not_started' | 'in_progress' | 'to_validate'

export const TODAY_STATE_ORDER: readonly TodayStateKey[] = ['not_started', 'in_progress', 'to_validate']

export function todayStateOf(item: TodayItem): TodayStateKey {
  if (item.group === 'validate' || item.gestures.validate) return 'to_validate'
  if (item.draft !== null) return 'in_progress'
  return 'not_started'
}

/** Le nombre de lignes par état — un état absent ne fait AUCUNE entrée (jamais un « 0 », GA-18/19). */
export function stateCounts(items: readonly TodayItem[]): Partial<Record<TodayStateKey, number>> {
  const counts: Partial<Record<TodayStateKey, number>> = {}
  for (const item of items) {
    const state = todayStateOf(item)
    const seen = counts[state]
    counts[state] = seen === undefined ? 1 : seen + 1
  }
  return counts
}
