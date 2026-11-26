import { useMemo } from 'react'
import { SETTINGS_SECTIONS } from '@/components/sidebar/items.settings'
import { GLOBAL_SEARCH_MIN_QUERY_LENGTH, GLOBAL_SEARCH_RESULT_LIMIT } from './constants'

/**
 * #2207.74 — recherche : paramètre.
 *
 * Aucune API : `SETTINGS_SECTIONS` (`components/sidebar/items.settings.ts`)
 * EST déjà l'index des pages de Réglages — le même que la barre latérale des
 * Réglages rend (`SettingsNavbarBody.tsx`). Filtré côté client sur le
 * libellé TRADUIT (jamais sur `labelKey`, que personne ne tape).
 *
 * `t` est passé par l'appelant plutôt que lu ici via `useTranslation` : les
 * libellés vivent dans le namespace `nav`, déjà chargé par la modale pour
 * d'autres raisons, et un second appel de traduction pour la même chose
 * diverge plus facilement qu'il ne s'accorde.
 *
 * `canManage` retire les pages `managerOnly` — MÊME garde que
 * `CustomerNavbarBody.tsx` (`gateManagerItems`) applique à la navigation
 * principale. Sans elle, un membre taperait « facturation » et trouverait une
 * page que le serveur lui refuse à l'ouverture — la retrouver n'est pas
 * l'avoir, et « on n'affiche pas ce qu'on n'a pas » vaut ici aussi.
 */
export function useSettingsSearchResults(query: string, t: (key: string) => string, canManage: boolean) {
  const trimmed = query.trim().toLowerCase()

  return useMemo(() => {
    if (trimmed.length < GLOBAL_SEARCH_MIN_QUERY_LENGTH) return []
    return SETTINGS_SECTIONS.flatMap(section => section.items)
      .filter(item => canManage || !item.managerOnly)
      .map(item => ({ to: item.to, label: t(item.labelKey) }))
      .filter(item => item.label.toLowerCase().includes(trimmed))
      .slice(0, GLOBAL_SEARCH_RESULT_LIMIT)
  }, [trimmed, t, canManage])
}
