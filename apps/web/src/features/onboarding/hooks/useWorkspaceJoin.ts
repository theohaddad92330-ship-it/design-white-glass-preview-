import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  pendingWorkspaceJoinRequestSchema,
  workspaceJoinOverviewSchema,
  type MyWorkspaceJoinRequest,
  type PendingWorkspaceJoinRequest,
  type WorkspaceJoinOverview,
} from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * #2016 — rejoindre un espace existant : le client des routes
 * `/workspace-join-requests/*`.
 *
 * Les réponses sont RE-validées par le contrat : une réponse que ce build ne
 * sait pas lire (décalage de déploiement) fait échouer la requête, et l'encart
 * ne s'affiche pas — le parcours d'avant reprend, à l'octet près.
 */
const workspaceJoinKeys = {
  overview: ['workspace-join', 'overview'] as const,
  pending: ['workspace-join', 'pending'] as const,
}

export function useWorkspaceJoinOverview() {
  const { user } = useSession()
  return useQuery<WorkspaceJoinOverview>({
    queryKey: workspaceJoinKeys.overview,
    queryFn: async () =>
      workspaceJoinOverviewSchema.parse(await apiFetch<unknown>({ path: '/workspace-join-requests/overview' })),
    enabled: !!user,
    staleTime: 30_000,
    retry: false,
  })
}

type JoinGesture = 'request' | 'dismiss'

/** « Demander l'accès » et « Ce n'est pas mon entreprise » — le même corps. */
export function useWorkspaceJoinGesture() {
  const qc = useQueryClient()
  return useMutation<MyWorkspaceJoinRequest, Error, { gesture: JoinGesture; workspaceId: string }>({
    mutationKey: ['workspace-join', 'gesture'],
    mutationFn: ({ gesture, workspaceId }) =>
      apiFetch<MyWorkspaceJoinRequest, { workspaceId: string }>({
        path: gesture === 'request' ? '/workspace-join-requests' : '/workspace-join-requests/dismiss',
        method: 'POST',
        body: { workspaceId },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: workspaceJoinKeys.overview }),
  })
}

/** Les demandes en attente de l'espace actif — pour ses administrateurs. */
export function usePendingWorkspaceJoinRequests(enabled: boolean) {
  return useQuery<PendingWorkspaceJoinRequest[]>({
    queryKey: workspaceJoinKeys.pending,
    queryFn: async () =>
      pendingWorkspaceJoinRequestSchema
        .array()
        .parse(await apiFetch<unknown>({ path: '/workspace-join-requests/pending' })),
    enabled,
    retry: false,
  })
}

/** Accepter ou refuser — un geste d'administrateur, le clic est la décision. */
export function useDecideWorkspaceJoinRequest() {
  const qc = useQueryClient()
  return useMutation<unknown, Error, { id: string; decision: 'accept' | 'refuse' }>({
    mutationKey: ['workspace-join', 'decide'],
    mutationFn: ({ id, decision }) =>
      apiFetch<unknown>({ path: `/workspace-join-requests/${id}/${decision}`, method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: workspaceJoinKeys.pending })
      // L'équipe change sur un « accepter » : la liste des membres se relit.
      void qc.invalidateQueries({ queryKey: ['team'] })
    },
  })
}
