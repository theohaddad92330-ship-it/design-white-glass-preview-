import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { teamCommentsApi } from '@/features/manager/api'
import { accountCommentKeys } from './useAccountTeamComments'

// #4158.31 — fils d'équipe : « mes fils ouverts », résoudre / rouvrir, répondre. Même porte que le fil
// du compte (`/team-comments`), aucun second chemin d'écriture.
const MY_OPEN_THREADS_KEY = ['accounts', 'team-comments', 'open-mine'] as const

/** Mes fils ouverts, tous comptes confondus — la requête ne part que si le filtre est activé. */
export function useMyOpenThreads(enabled: boolean) {
  return useQuery({
    queryKey: MY_OPEN_THREADS_KEY,
    queryFn: () => teamCommentsApi.list(undefined, undefined, true),
    enabled,
    staleTime: 15_000,
  })
}

/** Résoudre (ou rouvrir) la racine d'un fil, puis relire le fil du compte et « mes fils ouverts ». */
export function useSetThreadResolution(accountId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, resolved }: { id: string; resolved: boolean }) => teamCommentsApi.setResolution(id, resolved),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: accountCommentKeys.thread(accountId) })
      void queryClient.invalidateQueries({ queryKey: MY_OPEN_THREADS_KEY })
    },
  })
}

/** Répondre dans un fil : le serveur rattache la réponse à la racine et hérite de sa cible. */
export function useReplyToThread(accountId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ parentId, body }: { parentId: string; body: string }) =>
      teamCommentsApi.create({ body, parent_comment_id: parentId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: accountCommentKeys.thread(accountId) })
      void queryClient.invalidateQueries({ queryKey: MY_OPEN_THREADS_KEY })
    },
  })
}
