import { useSyncExternalStore } from 'react'

/**
 * #4431.4 — la raison rendue par le fournisseur au retour OAuth.
 *
 * Le retour rebondit sur `/integrations?<provider>=error&reason=…` ; la page lit l'URL puis la NETTOIE, et ses
 * cartes ne montent qu'après le chargement du registre — la raison serait perdue avant qu'une carte la lise.
 * On la retient ici, par fournisseur, jusqu'au prochain essai : l'écran dit POURQUOI, il ne se tait pas.
 */

const failures = new Map<string, string>()
const listeners = new Set<() => void>()

const notify = () => listeners.forEach(listener => listener())

export function rememberConnectorFailure(provider: string, reason: string): void {
  failures.set(provider, reason)
  notify()
}

export function clearConnectorFailure(provider: string): void {
  if (failures.delete(provider)) notify()
}

export function useConnectorFailure(provider: string): string | null {
  return useSyncExternalStore(
    listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => failures.get(provider) ?? null,
    () => null,
  )
}
