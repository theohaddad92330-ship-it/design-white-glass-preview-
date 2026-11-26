import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CreateWorkContext } from '@bellum/contracts'
import { useSession } from '@/lib/hooks/use-session'
import { workContextKeys, workContextsApi } from './api'

/** Les contextes de travail visibles pour l'utilisateur courant (#2455). */
export function useWorkContexts() {
  const { user } = useSession()
  return useQuery({
    queryKey: workContextKeys.list(user?.id),
    queryFn: () => workContextsApi.list(),
    enabled: !!user,
    staleTime: 30_000,
  })
}

/** Créer une variante — jamais une modification du profil principal (#2455.1). */
export function useCreateWorkContext() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateWorkContext) => workContextsApi.create(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workContextKeys.all })
    },
  })
}

/** Bascule : ouvre une conversation neuve, le fil d'origine reste intact (#2455.5). */
export function useActivateWorkContext() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => workContextsApi.activate(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workContextKeys.all })
    },
  })
}

/** Conservé pour l'historique, non proposé par défaut (#2455.3). */
export function useArchiveWorkContext() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => workContextsApi.archive(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workContextKeys.all })
    },
  })
}

/**
 * #2455.6 — le diff à proposer pour CE contexte, jamais une écriture
 * automatique (l'écran décide seul, sur clic explicite, quand l'appliquer).
 */
export function useWorkContextProfileSuggestion(contextId: string, enabled: boolean) {
  return useQuery({
    queryKey: [...workContextKeys.all, contextId, 'profile-suggestion'] as const,
    queryFn: () => workContextsApi.profileSuggestion(contextId),
    enabled,
    staleTime: 30_000,
  })
}
