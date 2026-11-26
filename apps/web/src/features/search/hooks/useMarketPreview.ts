import type { MarketPreview, WorkspaceMarket } from '@bellum/contracts'
import { MARKET_PATHS_BATCH_MAX } from '@bellum/contracts'
import { useQuery } from '@tanstack/react-query'
import { companiesApi, companyKeys } from '@/features/search/api'

/**
 * #1589.2 — CE QUE BELLUM SAIT DÉJÀ, LU AVANT LE CLIC QUI DÉBITE.
 *
 * ⚠️ Trois états, et l'écran doit pouvoir les distinguer tous les trois :
 * · `preview` — le corpus couvre ce compte, voici ce qu'il a observé ;
 * · `notCovered` — il a été LU, il n'a pas assez d'observations ;
 * · `unavailable` — il n'a PAS été lu.
 *
 * Les deux derniers se ressemblent et n'ont pas le même sens : « Bellum n'a pas
 * suffisamment d'observations sur ce compte » est une information sur le
 * corpus, « la mémoire marché est indisponible » est une panne. Les confondre
 * ferait annoncer une absence d'observation sur une base injoignable.
 *
 * ⚠️ Le statut se lit `!== 'ok'`, jamais `=== 'unavailable'` : entre le
 * déploiement du web (une minute) et celui de l'API (plusieurs), la réponse
 * peut prendre une forme qu'aucune des deux branches ne nomme, et une égalité
 * stricte laisserait alors passer un objet dont on lirait un champ absent.
 */
type MarketPreviewState = {
  readonly preview: MarketPreview | null
  readonly isPending: boolean
  /** Lu, mais pas assez d'observations — une information, pas une panne. */
  readonly notCovered: boolean
  /** Pas lu. L'écran le DIT, il n'écrit jamais « pas d'observations ». */
  readonly unavailable: boolean
}

/**
 * `staleTime` à cinq minutes : le corpus ne bouge qu'à une ingestion, et un
 * commercial qui hésite entre trois périmètres relit le même bloc plusieurs
 * fois avant de lancer.
 */
const STALE_MS = 5 * 60_000

export function useMarketPreview(name: string | null, country: WorkspaceMarket): MarketPreviewState {
  const trimmed = name?.trim() ?? ''
  const enabled = trimmed.length > 0
  const { data, isPending, isError } = useQuery({
    queryKey: companyKeys.marketPreview(trimmed, country),
    queryFn: () => companiesApi.marketPreview(trimmed, country),
    enabled,
    staleTime: STALE_MS,
  })

  if (!enabled) return { preview: null, isPending: false, notCovered: false, unavailable: false }
  // `isPending` est vrai tant qu'aucune donnée n'est là : ne rien conclure.
  if (isPending) return { preview: null, isPending: true, notCovered: false, unavailable: false }
  if (isError || !data || data.status !== 'ok') {
    return { preview: null, isPending: false, notCovered: false, unavailable: true }
  }
  return { preview: data.preview, isPending: false, notCovered: data.preview === null, unavailable: false }
}

/**
 * #1593.2 — les parcours observés pour le LOT de chips suggérées.
 *
 * ⚠️ Rend `undefined` sur une panne, et non un lot de `null` : l'appelant
 * laisse alors l'ordre du serveur intact plutôt que de « classer » sur une
 * lecture qui n'a pas eu lieu.
 */
export function useMarketPathsForNames(
  names: readonly string[],
  country: WorkspaceMarket,
): Record<string, number | null> | undefined {
  // La borne du contrat, appliquée AVANT l'appel : trois à quatre suggestions
  // aujourd'hui, mais un écran ne doit pas dépendre d'un cap qui vit ailleurs.
  const wanted = names.slice(0, MARKET_PATHS_BATCH_MAX)
  const { data } = useQuery({
    queryKey: companyKeys.marketPaths(wanted, country),
    queryFn: () => companiesApi.marketPaths(wanted, country),
    enabled: wanted.length > 0,
    staleTime: STALE_MS,
  })
  return data?.status === 'ok' ? data.paths : undefined
}
