import { useEffect, useSyncExternalStore } from 'react'

/**
 * Combien de barres de sélection FLOTTANTES (fixées en bas d'écran, hors du
 * flux normal de la page) sont ouvertes EN CE MOMENT, n'importe où dans
 * l'app.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UN SECOND COMPTEUR, ET PAS `useAnySheetOpen`
 * ─────────────────────────────────────────────────────────────────────────
 * Défaut MESURÉ en production (24/09/2026, recette #2157.10) : sur
 * `/accounts`, avec 2 comptes cochés, le bouton « Créer une cible » de la
 * barre de sélection (`SelectionBar.tsx`, `fixed bottom-6 … z-40`) était
 * ENTIÈREMENT recouvert par le composer flottant de Laura (`z-widget`, 80) —
 * même bandeau bas d'écran, deux flottants, un seul répond au clic.
 *
 * `useAnySheetOpen` (`components/sheet.tsx`, GA-205) compte les `<Sheet>` —
 * une boîte de dialogue Radix, avec voile et piège au clavier. Une barre de
 * sélection n'en est pas une : elle vit dans le flux normal de la page,
 * juste positionnée `fixed`, sans voile ni `Dialog.Root`. Le mécanisme est le
 * même (un compteur partagé, un consommateur qui s'efface) ; la source est
 * différente, d'où ce second compteur plutôt qu'un détournement du premier.
 *
 * GA-386 tient le câblage côté `LauraDock` (le rond ET la ligne agrandie
 * s'effacent tant que ce compteur est > 0) — exactement le traitement que
 * GA-205 a posé pour le widget de retour face à un tiroir.
 */
let openSelectionBarCount = 0
const openSelectionBarListeners = new Set<() => void>()

function notifyOpenSelectionBarListeners(): void {
  for (const listener of openSelectionBarListeners) listener()
}

function subscribeToOpenSelectionBars(listener: () => void): () => void {
  openSelectionBarListeners.add(listener)
  return () => {
    openSelectionBarListeners.delete(listener)
  }
}

function getOpenSelectionBarSnapshot(): boolean {
  return openSelectionBarCount > 0
}

function getOpenSelectionBarServerSnapshot(): boolean {
  return false
}

/**
 * À appeler SANS CONDITION par tout composant qui rend une barre de
 * sélection flottante fixée en bas d'écran. Un tel composant n'est monté que
 * pendant que la barre est visible — le motif déjà en place partout où l'une
 * existe (le rendu conditionnel vit chez l'APPELANT, dans un
 * `AnimatePresence` ou un simple `if`) — donc « monté » ⇔ « ouverte », sans
 * prop `open` à faire voyager en plus.
 */
export function useRegisterSelectionBarOpen(): void {
  useEffect(() => {
    openSelectionBarCount += 1
    notifyOpenSelectionBarListeners()
    return () => {
      openSelectionBarCount -= 1
      notifyOpenSelectionBarListeners()
    }
  }, [])
}

/** True tant qu'au moins une barre de sélection flottante est ouverte. */
export function useAnySelectionBarOpen(): boolean {
  return useSyncExternalStore(
    subscribeToOpenSelectionBars,
    getOpenSelectionBarSnapshot,
    getOpenSelectionBarServerSnapshot,
  )
}
