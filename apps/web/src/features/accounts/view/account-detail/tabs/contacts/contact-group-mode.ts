import { useCallback, useState } from 'react'
import type { GroupMode } from './types'

/**
 * Comment l'onglet Contacts groupe PAR DÉFAUT — le réglage, à UN endroit (GA-26),
 * sur le patron de `conversations-grouping.ts`.
 *
 * #3153 (retour bêta) — le défaut devient « par persona » (le type de poste,
 * la famille de fonction), contre « par entité » jusqu'ici. Retenu PAR
 * PERSONNE SUR CE NAVIGATEUR (`localStorage`), pas en base : c'est une
 * préférence de lecture. Un choix déjà mémorisé est respecté — seul un
 * poste qui n'a JAMAIS choisi bascule sur le nouveau défaut.
 *
 * #3154 a retiré le mode « technologie » : une valeur ancienne qui le
 * pointait encore retombe proprement sur le défaut, jamais une erreur.
 *
 * ⚠️ `localStorage` peut LEVER (navigation privée, stockage bloqué, quota) :
 * sans stockage, on rend le défaut et le choix vit le temps de l'onglet.
 */
export const CONTACT_GROUP_MODE_STORAGE_KEY = 'bellum-contacts-group-mode'

const VALID_MODES: readonly GroupMode[] = ['entity', 'persona']

/** Le défaut, nommé une fois — voir le docblock pour la raison. */
const DEFAULT_GROUP_MODE: GroupMode = 'persona'

/** L'état stocké, ou le défaut. Une valeur inconnue (mode retiré, saisie à la main) rend le défaut. */
export function readContactGroupMode(): GroupMode {
  try {
    const stored = localStorage.getItem(CONTACT_GROUP_MODE_STORAGE_KEY)
    return (VALID_MODES as readonly string[]).includes(stored ?? '') ? (stored as GroupMode) : DEFAULT_GROUP_MODE
  } catch {
    return DEFAULT_GROUP_MODE
  }
}

function writeContactGroupMode(mode: GroupMode): void {
  try {
    localStorage.setItem(CONTACT_GROUP_MODE_STORAGE_KEY, mode)
  } catch {
    /* pas de stockage : le choix ne vit que le temps de l'onglet */
  }
}

/** L'état et son écriture. Le seul consommateur est `TabContacts`. */
export function useContactGroupMode(): readonly [GroupMode, (next: GroupMode) => void] {
  const [mode, setMode] = useState<GroupMode>(readContactGroupMode)
  const choose = useCallback((next: GroupMode) => {
    writeContactGroupMode(next)
    setMode(next)
  }, [])
  return [mode, choose] as const
}
