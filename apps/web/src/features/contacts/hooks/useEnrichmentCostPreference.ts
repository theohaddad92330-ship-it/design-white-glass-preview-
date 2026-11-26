import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ENRICHMENT_COST_PREFERENCE_KEY, readSkipEnrichmentCost } from '@bellum/contracts'
import { memoryApi, memoryKeys } from '@/features/memory/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * #4016.L8b — « ne plus me demander » le coût d'enrichir UN contact : la préférence de CETTE personne,
 * lue dans son sac `user_preferences` (le même que `useMessageApproach`, une seule requête en cache).
 * `skip` vaut `false` tant que le sac n'est pas lu : dans le doute, la question se pose.
 * `setSkip(false)` RETIRE la clé (jamais écrite à `false`) — le retrait vit aussi dans Réglages ›
 * Mémoire de Laura, qui liste et oublie chaque préférence.
 */
export function useEnrichmentCostPreference() {
  const { user } = useSession()
  const qc = useQueryClient()
  const query = useQuery<Record<string, unknown>, Error, boolean>({
    queryKey: memoryKeys.preferences(),
    queryFn: () => memoryApi.getPreferences(),
    select: bag => readSkipEnrichmentCost(bag),
    enabled: !!user,
  })
  const mutation = useMutation<void, Error, boolean>({
    mutationKey: ['memory', ENRICHMENT_COST_PREFERENCE_KEY],
    mutationFn: async skip => {
      if (!skip) {
        await memoryApi.forgetLedgerEntry('preferences', ENRICHMENT_COST_PREFERENCE_KEY)
        return
      }
      await memoryApi.patchPreferences({ [ENRICHMENT_COST_PREFERENCE_KEY]: true })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: memoryKeys.all }),
  })
  return { skip: query.data === true, setSkip: (skip: boolean) => mutation.mutate(skip) }
}
