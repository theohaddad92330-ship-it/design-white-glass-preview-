import { keepPreviousData, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { discoverSearchKey } from '@/features/discover/lib/discover-search-key'
import { ApiError } from '@/lib/api-error'
import { discoverApi } from '@/features/discover/api/discover-api'
import { holdFound, releaseFound } from '@/features/discover/lib/discover-held-lot'
import { mergeSecondPass, needsSecondPass } from '@/features/discover/lib/discover-second-pass'
import type {
  DiscoverRegistryQuery,
  DiscoverResponse,
  DiscoverSignalsQuery,
} from '@/features/discover/lib/discover-types'

/* ------------------------------------------------------------------ */
/*  Exécution d'une recherche Découvrir.                                */
/*                                                                     */
/*  La v1 gardait ses résultats dans un `useState` : quitter l'écran    */
/*  les perdait. Ici react-query est la source de vérité — la liste     */
/*  survit à la navigation, et la clé de cache EST la requête, donc     */
/*  rejouer un périmètre déjà vu est instantané.                        */
/* ------------------------------------------------------------------ */

export type DiscoverRequest =
  { mode: 'registry'; query: DiscoverRegistryQuery } | { mode: 'signals'; query: DiscoverSignalsQuery }

/**
 * #4962 — le plafond d'UNE recherche, tous passages compris (lot court, liste, second passage). Le serveur coupe
 * à 60 s (registre) / 125 s (signaux) PAR appel : sans plafond ici, la liste + son second passage empilaient ~2 min
 * d'« Interrogation du registre… » (Python, Java). Passé ce délai l'écran DIT la raison (`discover_timeout`).
 */
export const DISCOVER_SEARCH_CEILING_MS = { registry: 125_000, signals: 135_000 } as const

function rejectAfter(ms: number): { promise: Promise<never>; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined
  const promise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ApiError('Discover search timed out', 503, 'discover_timeout')), ms)
  })
  return { promise, cancel: () => clearTimeout(timer) }
}

/**
 * `request === null` = l'utilisateur n'a encore rien lancé : aucune requête ne
 * part (l'écran reste en état « idle »). Découvrir est gratuit, mais ce n'est
 * pas une raison pour tirer sur les sources sans intention explicite.
 */
/** #5212 — une recherche par compétence résout des identités au registre (120 rpm, concurrence 5) : un premier lot en
 *  parallèle s'y dispute le débit et vide la liste complète (31-39 s au lieu de 9-14 s, parfois 0 candidat). */
function searchesBySkill(request: DiscoverRequest): boolean {
  const filters = (
    request.query as {
      filters?: { keywords?: string[]; skills?: string[]; technologiesObserved?: string[]; freetext?: string }
    }
  ).filters
  // Le moteur lit la compétence AUSSI dans le texte libre (« Java » tapé → mots-clés, `_apply_reading`) et dans les
  // technologies observées (`skill_terms`) : recette prod 04/11, « Java » tapé partait encore en deux appels.
  return (
    (filters?.keywords?.length ?? 0) > 0 ||
    (filters?.skills?.length ?? 0) > 0 ||
    (filters?.technologiesObserved?.length ?? 0) > 0 ||
    (filters?.freetext ?? '').trim().length > 0
  )
}

export function useDiscoverSearch(
  request: DiscoverRequest | null,
  /** #3597.5 — « Voir 10 de plus » élargit le `limit` : on garde la liste déjà
   *  affichée pendant que la page plus grande arrive, au lieu de la remplacer
   *  par un écran de chargement. */
  options: {
    keepPrevious?: boolean
    /** #4363.3 / #4517 — taille d'un PREMIER LOT : une requête courte part en parallèle de la complète. Ses
     *  entreprises ne s'affichent PAS pendant l'attente (un seul chargement, puis tout d'un coup) : elles sont tenues
     *  en réserve et ne sortent que si la recherche est arrêtée (`stopDiscoverSearch`). Absent = un seul appel. */
    firstLot?: number
  } = {},
): UseQueryResult<DiscoverResponse> {
  const client = useQueryClient()
  async function runSearch(signal: AbortSignal): Promise<DiscoverResponse> {
    {
      const run = (r: DiscoverRequest): Promise<DiscoverResponse> =>
        r.mode === 'signals' ? discoverApi.signals(r.query, signal) : discoverApi.registry(r.query, signal)
      if (!request) return run(request as unknown as DiscoverRequest)
      const lot = options.firstLot
      const heldKey = JSON.stringify(discoverSearchKey(request))
      let fullDone = false
      if (lot && lot > 0 && request.query.limit > lot && !searchesBySkill(request)) {
        // Son échec se tait : la liste complète reste la source de vérité (et dira la panne si elle en a une).
        const short = { ...request, query: { ...request.query, limit: lot } } as DiscoverRequest
        void run(short)
          .then(first => {
            if (!fullDone && !signal.aborted) holdFound(client, heldKey, { ...first, partial: true })
          })
          .catch(() => undefined)
      }
      let full: DiscoverResponse
      try {
        full = await run(request)
      } finally {
        fullDone = true
      }
      // #4305 / #4517 — la liste coupée par son budget de temps est COMPLÉTÉE. Lot Q (Louis, budget ~55 s / couperet
      // API 60 s) : ce second passage ne BLOQUE plus l'écran (attente doublée, 96-119 s mesurés en prod) — la
      // première liste s'affiche tout de suite, marquée `completing`, et le passage se termine EN ARRIÈRE-PLAN en
      // la complétant (jamais en la vidant). Son échec laisse la liste du premier passage, sans erreur.
      if (!needsSecondPass(request, full)) {
        releaseFound(client, heldKey)
        return full
      }
      releaseFound(client, heldKey)
      const queryKey = discoverSearchKey(request)
      // `setTimeout` : le résultat s'écrit APRÈS que la requête a rendu la première liste (sinon un second passage
      // immédiat serait écrasé par le retour de `queryFn`).
      const settle = (next: DiscoverResponse) => {
        setTimeout(() => {
          if (!signal.aborted) client.setQueryData<DiscoverResponse>(queryKey, next)
        }, 0)
      }
      void discoverApi
        .registry(request.query as DiscoverRegistryQuery, signal)
        .then(second => settle(mergeSecondPass(full, second).merged))
        .catch(() => settle({ ...full, completing: false }))
      return { ...full, completing: true }
    }
  }

  return useQuery<DiscoverResponse>({
    placeholderData: options.keepPrevious ? keepPreviousData : undefined,
    queryKey: discoverSearchKey(request),
    enabled: request !== null,
    // Les sources (registre, BOAMP, DECP, France Travail) bougent à la journée,
    // pas à la seconde : re-tirer à chaque focus n'apporterait rien.
    staleTime: 5 * 60_000,
    // #4312 — revenir de Laura (ou d'une fiche) rouvre la liste telle qu'elle était : le cache survit au
    // démontage (30 min) et un remontage ne refait pas l'appel, même périmé. Le bouton de relance
    // (`refetch`) et un changement de critères (autre clé) restent les seuls moyens de rappeler les sources.
    gcTime: 30 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    // Pas de retry : une panne de source doit se voir (`degraded` / état
    // d'erreur), pas se traduire par trois tentatives silencieuses.
    retry: false,
    queryFn: async ({ signal }) => {
      if (!request) return runSearch(signal)
      const ceiling = rejectAfter(DISCOVER_SEARCH_CEILING_MS[request.mode])
      try {
        return await Promise.race([runSearch(signal), ceiling.promise])
      } finally {
        ceiling.cancel()
      }
    },
  })
}
