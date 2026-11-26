import { useSyncExternalStore } from 'react'

/**
 * #3551 — l'EMPLACEMENT, dans le fil de /chat, où la carte proactive de Laura se pose.
 *
 * `LauraCard` est montée globalement (`LauraDock`) en surimpression. Sur /chat, toute
 * surimpression recouvre un contrôle (composeur en bas, en-tête en haut : recette prod
 * 02/10 puis 03/10). La carte s'y pose donc DANS LE FLUX : `Chat` déclare ici un
 * élément, `LauraCard` s'y téléporte. Une seule instance, un seul budget d'interruption.
 */
let slot: HTMLElement | null = null
const listeners = new Set<() => void>()

export function setLauraChatSlot(element: HTMLElement | null): void {
  if (slot === element) return
  slot = element
  listeners.forEach(listener => listener())
}

export function useLauraChatSlot(): HTMLElement | null {
  return useSyncExternalStore(
    listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => slot,
    () => null,
  )
}
