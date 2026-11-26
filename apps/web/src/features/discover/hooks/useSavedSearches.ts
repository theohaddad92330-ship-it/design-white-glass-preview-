import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useCreateSavedView, useMarkSavedViewRun, useRemoveSavedView, useSavedViews } from '@/features/governance/api'
import { usePlanFeature } from '@/features/plan-features/usePlanFeature'
import { useSession } from '@/lib/hooks/use-session'
import {
  localSearchesToImport,
  markLocalSearchesImported,
  savedSearchToCreateInput,
  savedViewToSearch,
  type SavedSearch,
  type SavedSearchInput,
} from '@/features/discover/lib/discover-saved-searches'

/** L'écran de Découvrir range ses périmètres avec lui. */
const SCOPE = 'discover' as const

/**
 * Ce que la colonne de gauche doit DIRE, et qui n'est pas une liste :
 * `loading` n'est pas `ready` avec zéro élément, et `error` encore moins —
 * « je n'ai pas pu regarder » rendu comme « tu n'as aucune recherche » se lit
 * comme un fait, et fait recommencer un travail déjà fait.
 */
type SavedSearchesStatus = 'loading' | 'error' | 'locked' | 'ready'

interface UseSavedSearches {
  searches: SavedSearch[]
  save: (input: SavedSearchInput) => void
  remove: (id: string) => void
  /** #3873 — « Rejouer » EST une exécution : elle se date côté serveur. */
  markRun: (id: string) => void
  status: SavedSearchesStatus
}

/**
 * Les vues enregistrées de Découvrir, côté SERVEUR (#2151.3 à .13).
 *
 * Elles vivaient dans le `localStorage` : elles ne survivaient ni au changement
 * de poste, ni au vidage du cache, ni au partage — alors que `saved_views`
 * portait déjà la table, la borne, `owner_id` et `shared`, et n'avait qu'un
 * seul appelant web. C'est le motif n°1 de ce dépôt : du code juste que
 * personne n'appelle. On BRANCHE l'existant plutôt que d'en faire un second.
 *
 * ⚠️ Le contrôleur porte `@RequireFeature('crm_native')` : sur une offre qui ne
 * l'ouvre pas, la requête partirait chercher un 403. On ne la pose pas, et le
 * panneau le DIT (`locked`). Le doute n'interdit rien — offre inconnue, on
 * laisse faire, le serveur tranche.
 */
export function useSavedSearchesStatus(): { status: SavedSearchesStatus; searches: SavedSearch[] } {
  const { known, allowed } = usePlanFeature('crm_native')
  const locked = known && !allowed
  const views = useSavedViews(SCOPE, { enabled: !locked })

  const searches = useMemo(() => (views.data ?? []).map(savedViewToSearch), [views.data])
  const status: SavedSearchesStatus = locked
    ? 'locked'
    : views.isLoading
      ? 'loading'
      : views.isError
        ? 'error'
        : 'ready'

  return { status, searches }
}

/**
 * La même chose, plus les deux écritures et l'IMPORT des recherches déjà
 * enregistrées dans ce navigateur.
 *
 * ⚠️ L'import ne SUPPRIME rien : il remonte ce qui manque, puis MARQUE les
 * entrées locales comme importées. On archive, on ne supprime pas — si l'import
 * tombe en route, la donnée de l'utilisateur est encore là, et la purge RGPD
 * (`clearDiscoverStorage`) balaie la clé d'origine comme la marque.
 */
export function useSavedSearches(): UseSavedSearches {
  const { user } = useSession()
  const userId = user?.id
  const { status, searches } = useSavedSearchesStatus()
  /* `mutate` est STABLE chez react-query, l'objet de mutation ne l'est pas :
     on le déstructure pour pouvoir le mettre en dépendance de l'effet sans le
     faire rejouer à chaque rendu — et sans désactiver une règle de lint. */
  const { mutate: createView } = useCreateSavedView(SCOPE)
  const { mutate: removeView } = useRemoveSavedView(SCOPE)
  const { mutate: markViewRun } = useMarkSavedViewRun(SCOPE)

  /* Une seule tentative d'import par montage : un import qui échoue ne doit pas
     se rejouer à chaque rendu, ce qui martèlerait l'API avec les mêmes refus. */
  const importAttempted = useRef(false)

  useEffect(() => {
    if (status !== 'ready' || !userId || importAttempted.current) return
    const pending = localSearchesToImport(
      userId,
      searches.map(search => search.label),
    )
    if (pending.length === 0) return
    importAttempted.current = true
    for (const search of pending) {
      createView(savedSearchToCreateInput({ label: search.label, filters: search.filters }), {
        onSuccess: () => markLocalSearchesImported(userId, [search.id]),
      })
    }
  }, [status, userId, searches, createView])

  const save = useCallback((input: SavedSearchInput) => createView(savedSearchToCreateInput(input)), [createView])
  const removeOne = useCallback((id: string) => removeView({ id }), [removeView])
  const markRun = useCallback((id: string) => markViewRun({ id }), [markViewRun])

  return { searches, save, remove: removeOne, markRun, status }
}
