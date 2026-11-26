import { useEffect, useRef } from 'react'
import { trackSearchPerformed } from '@/lib/product-tracker'

/**
 * #1688.2 / #2154.30 — `search_performed`, ÉMIS quand la recherche RÉSOUT, déduplié
 * par requête. Un seul endroit (GA-26) pour `/contacts`, `/accounts`, `/consultants`
 * et `/projects` : le NOMBRE de résultats, jamais le texte tapé.
 *
 * `total` est le compte du serveur (jamais la longueur d'une page). `undefined` — échec
 * réseau, chargement — n'émet pas : on ne dit pas « 0 résultat » quand on ne sait pas.
 * Rien n'émet tant qu'aucun texte n'est tapé : parcourir une liste n'est pas chercher.
 */
export function useTrackSearchPerformed(
  screen: string,
  query: string,
  total: number | undefined,
  isLoading: boolean,
): void {
  const lastTrackedQueryRef = useRef<string | null>(null)
  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length === 0 || isLoading) {
      if (trimmed.length === 0) lastTrackedQueryRef.current = null
      return
    }
    if (lastTrackedQueryRef.current === trimmed) return
    if (total === undefined) return
    lastTrackedQueryRef.current = trimmed
    trackSearchPerformed(screen, total)
  }, [screen, query, isLoading, total])
}
