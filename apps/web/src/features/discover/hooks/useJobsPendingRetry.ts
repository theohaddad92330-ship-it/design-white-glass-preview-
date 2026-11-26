import { useEffect, useState } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import type { DiscoverResponse } from '@/features/discover/lib/discover-types'

/** #4045 — le délai laissé à la collecte d'arrière-plan avant l'UNIQUE relecture. */
export const JOBS_RETRY_DELAY_MS = 20_000

/** #3901 — plafond de relectures par recherche : la file des offres tourne à 1 requête/s, une
 *  page de 25 cartes demande plusieurs passages. Borné, jamais une boucle infinie. */
export const JOBS_RETRY_MAX = 6

/**
 * Tant que la réponse dit que des cartes n'ont pas pu être cherchées dans le budget
 * (`jobsPending`), relit la MÊME recherche `delayMs` après chaque réponse : la collecte
 * avance en arrière-plan et range ses offres dans le cache partagé, chaque passage en
 * reprend davantage. S'arrête dès que plus rien n'est en attente (la ligne « offres en
 * cours » disparaît) ou après `JOBS_RETRY_MAX` relectures pour une même recherche.
 * Les cartes se mettent à jour sans recharger la page.
 *
 * Rend `true` tant que la recherche d'offres est « en cours » — le bandeau le dit sans
 * nommer de source.
 */
export function useJobsPendingRetry(
  query: Pick<UseQueryResult<DiscoverResponse>, 'data' | 'isFetching' | 'refetch'>,
  searchKey: string,
  delayMs: number = JOBS_RETRY_DELAY_MS,
): boolean {
  const [retries, setRetries] = useState<{ key: string; n: number }>({ key: searchKey, n: 0 })
  const done = retries.key === searchKey ? retries.n : 0
  // #4677.2 — le drapeau serveur ne suffit pas : une liste dont AUCUNE carte n'attend plus ses offres n'est plus
  // « en cours » (le bandeau restait affiché sur une liste complète). Sans carte à lire, le drapeau seul décide.
  const candidates = query.data?.candidates ?? []
  const pending =
    query.data?.jobsPending === true &&
    (candidates.length === 0 || candidates.some(c => c.signalsState === 'pending' && !c.signalsSearched))
  const { refetch, isFetching } = query

  useEffect(() => {
    // Pas de minuteur pendant une relecture : le suivant s'arme sur la réponse reçue.
    if (!pending || isFetching || done >= JOBS_RETRY_MAX) return
    const timer = setTimeout(() => {
      setRetries({ key: searchKey, n: done + 1 })
      void refetch()
    }, delayMs)
    return () => clearTimeout(timer)
  }, [pending, isFetching, done, searchKey, delayMs, refetch])

  return pending && (done < JOBS_RETRY_MAX || isFetching)
}
