import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CreateWatchlistRuleInput, WatchlistRule } from '@bellum/contracts'
import { useSession } from '@/lib/hooks/use-session'
import { watchlistRulesApi } from './api'

export const WATCHLIST_RULES_KEY = ['watchlist-rules'] as const

/**
 * Les règles personnelles de veille du workspace actif (§11), avec des mutations
 * add/remove qui ré-invalident la liste. Non bloquant : la requête est activée
 * seulement une fois l'utilisateur connu, et l'écran gère l'état vide.
 */
export function useWatchlistRules() {
  const { user } = useSession()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: WATCHLIST_RULES_KEY,
    queryFn: () => watchlistRulesApi.list(),
    enabled: !!user,
    staleTime: 60_000,
  })

  const createMutation = useMutation<WatchlistRule, Error, CreateWatchlistRuleInput>({
    mutationFn: input => watchlistRulesApi.create(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: WATCHLIST_RULES_KEY })
    },
  })

  const removeMutation = useMutation<void, Error, string>({
    mutationFn: id => watchlistRulesApi.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: WATCHLIST_RULES_KEY })
    },
  })

  return {
    rules: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    createRule: createMutation.mutate,
    isCreating: createMutation.isPending,
    createError: createMutation.isError,
    removeRule: removeMutation.mutate,
    removingId: removeMutation.isPending ? removeMutation.variables : undefined,
  }
}
