import { useSyncExternalStore } from 'react'
import type { CommuneCoordinates } from '@bellum/contracts/geo-coordinates'

/**
 * #5069 — l'UNIQUE lecture web des coordonnées de communes (GA-26). Le référentiel (~430 Ko) vit dans
 * `@bellum/contracts/geo-coordinates` et ne se charge qu'À LA DEMANDE (chunk séparé, jamais le bundle initial).
 * Tant qu'il n'est pas chargé, toute lecture rend `null` — « inconnu », jamais une distance devinée ; les écrans
 * qui en dépendent lisent `useCommuneCoordinatesReady()` pour se recalculer à l'arrivée.
 */

type Lookup = (name: string, department?: string | null) => CommuneCoordinates | null

let lookup: Lookup | null = null
let loading: Promise<void> | null = null
const listeners = new Set<() => void>()

export function loadCommuneCoordinates(): Promise<void> {
  loading ??= import('@bellum/contracts/geo-coordinates').then(
    module => {
      lookup = module.communeCoordinates
      listeners.forEach(listener => listener())
    },
    () => {
      loading = null // un échec de chargement se retente au prochain appel ; les lectures restent `null`
    },
  )
  return loading
}

/** Les coordonnées CONNUES d'une commune ; `null` = inconnue, homonyme non départagé ou référentiel pas encore chargé. */
export function knownCityCoordinates(city: string, department?: string | null): CommuneCoordinates | null {
  return lookup?.(city, department) ?? null
}

/** Vrai quand le référentiel est chargé (déclenche le chargement au premier appel). */
export function useCommuneCoordinatesReady(): boolean {
  return useSyncExternalStore(
    onChange => {
      void loadCommuneCoordinates()
      listeners.add(onChange)
      return () => void listeners.delete(onChange)
    },
    () => lookup !== null,
    () => false,
  )
}
