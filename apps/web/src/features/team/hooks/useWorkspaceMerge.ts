import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { WorkspaceMergeRequestView } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * #4158.57 — rapatrier l'espace personnel dans l'espace ESN rejoint : le client de `/workspace-merge/*`.
 * Rien ne bouge sans l'aperçu, la validation de l'utilisateur ET celle d'un admin de l'espace cible.
 */
const mergeKeys = {
  mine: ['workspace-merge', 'mine'] as const,
  pending: ['workspace-merge', 'pending'] as const,
}

/** Un job en cours se suit : la liste se relit tant qu'une demande tourne. */
const isMoving = (rows: WorkspaceMergeRequestView[] | undefined): boolean =>
  (rows ?? []).some(row => row.status === 'approved' || row.status === 'running')

export function useMyWorkspaceMerges() {
  const { user } = useSession()
  return useQuery<WorkspaceMergeRequestView[]>({
    queryKey: mergeKeys.mine,
    queryFn: () => apiFetch<WorkspaceMergeRequestView[]>({ path: '/workspace-merge/mine' }),
    enabled: !!user,
    retry: false,
    refetchInterval: query => (isMoving(query.state.data) ? 5_000 : false),
  })
}

export function usePendingWorkspaceMerges(enabled: boolean) {
  return useQuery<WorkspaceMergeRequestView[]>({
    queryKey: mergeKeys.pending,
    queryFn: () => apiFetch<WorkspaceMergeRequestView[]>({ path: '/workspace-merge/pending' }),
    enabled,
    retry: false,
    refetchInterval: query => (isMoving(query.state.data) ? 5_000 : false),
  })
}

type MergeGesture =
  | { kind: 'preview'; targetWorkspaceId: string }
  | { kind: 'confirm' | 'approve'; id: string; hash: string }
  | { kind: 'cancel' | 'resume' | 'reject'; id: string }

/** Tous les gestes de la demande — un seul client, chaque route revérifie les droits côté serveur. */
export function useWorkspaceMergeGesture() {
  const qc = useQueryClient()
  return useMutation<WorkspaceMergeRequestView, Error, MergeGesture>({
    mutationKey: ['workspace-merge', 'gesture'],
    mutationFn: gesture => {
      if (gesture.kind === 'preview') {
        return apiFetch<WorkspaceMergeRequestView, { targetWorkspaceId: string }>({
          path: '/workspace-merge/preview',
          method: 'POST',
          body: { targetWorkspaceId: gesture.targetWorkspaceId },
        })
      }
      if (gesture.kind === 'confirm' || gesture.kind === 'approve') {
        return apiFetch<WorkspaceMergeRequestView, { hash: string }>({
          path: `/workspace-merge/${gesture.id}/${gesture.kind}`,
          method: 'POST',
          body: { hash: gesture.hash },
        })
      }
      return apiFetch<WorkspaceMergeRequestView>({
        path: `/workspace-merge/${gesture.id}/${gesture.kind}`,
        method: 'POST',
      })
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: mergeKeys.mine })
      void qc.invalidateQueries({ queryKey: mergeKeys.pending })
    },
  })
}
