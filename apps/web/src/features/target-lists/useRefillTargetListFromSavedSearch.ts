import type { TargetList } from '@bellum/contracts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { i18n } from '@/i18n'
import { emptyUnifiedFilters, type UnifiedFilters } from '@/features/discover/lib/discover-filters'
import { addCandidatesToTargetList, searchCandidatesForSavedSearch } from './fill-target-list-from-search'

const TARGET_LISTS_KEY = ['target-lists'] as const

interface RefillTargetListResult {
  addedCount: number
  foundCount: number
  failedCount: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * #3075 (rattrapage) — une cible d'origine « recherche enregistrée » créée
 * AVANT le correctif (`e0c4b4fb`, puis celui-ci) est restée vide ou
 * incomplète : rien ne la re-remplit d'elle-même, et on ne rejoue JAMAIS tout
 * le parc au déploiement (doctrine Louis 18/09/2026, née de #2543 — un
 * correctif de collecte rattrape l'existant, CIBLÉ, jamais en masse).
 *
 * Ce geste est le rattrapage CIBLÉ, par un clic sur LA liste concernée
 * (`TargetListCard`) : il rejoue la même recherche que la création (même
 * `source_query`) et verse ce qui MANQUE encore par {@link addCandidatesToTargetList}
 * — le même chemin que la création, jamais un doublon. `alreadyInList` (les
 * comptes déjà des items de CETTE liste) protège une correction humaine : un
 * candidat retiré par un commercial n'est jamais réinséré tant que son
 * `accountId` n'a pas quitté la liste — retirer un item de nouveau après un
 * rattrapage reste possible, ce geste ne le ré-ajoute qu'une fois, jamais en boucle.
 */
export function useRefillTargetListFromSavedSearch() {
  const queryClient = useQueryClient()

  return useMutation<RefillTargetListResult, Error, { list: TargetList }>({
    mutationKey: ['target-lists', 'refill-from-saved-search'],
    mutationFn: async ({ list }) => {
      const filters: UnifiedFilters = isRecord(list.source_query)
        ? { ...emptyUnifiedFilters(), ...(list.source_query as Partial<UnifiedFilters>) }
        : emptyUnifiedFilters()
      const alreadyInList = new Set(list.items.filter(item => item.kind === 'account').map(item => item.ref_id))

      const candidates = await searchCandidatesForSavedSearch(filters)
      return addCandidatesToTargetList(list.id, candidates, alreadyInList)
    },
    onSuccess: ({ addedCount, foundCount, failedCount }, { list }) => {
      queryClient.invalidateQueries({ queryKey: TARGET_LISTS_KEY })
      const description =
        failedCount > 0
          ? i18n.t('targets:list.refillPartial', { count: failedCount, added: addedCount, found: foundCount })
          : addedCount > 0
            ? i18n.t('targets:list.refillAdded', { count: addedCount })
            : i18n.t('targets:list.refillNothingNew')
      toast.success(i18n.t('targets:list.refillSuccess', { name: list.name }), { description })
    },
    onError: error => {
      toast.error(i18n.t('targets:list.refillError'), { description: error.message })
    },
  })
}
