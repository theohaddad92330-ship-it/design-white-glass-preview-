import type { AtsConnectResult, AtsSnapshot, AtsStatus, AtsTestResult, AtsWriteRequestView } from '@bellum/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

/** « Ton ATS » — on lit le vivier ; toute écriture dans l'ERP passe par la validation d'un responsable (`atsWriteApi`). */
export const atsApi = {
  status(): Promise<AtsStatus> {
    return apiFetch<AtsStatus>({ path: '/ats/status' })
  },
  /** #4688 — l'URL d'autorisation OAuth2 de l'éditeur ; aucun secret ne transite par nous. */
  connect(): Promise<AtsConnectResult> {
    return apiFetch<AtsConnectResult, Record<string, never>>({ path: '/ats/connect', method: 'POST', body: {} })
  },
  test(): Promise<AtsTestResult> {
    return apiFetch<AtsTestResult>({ path: '/ats/test', method: 'POST' })
  },
  snapshot(): Promise<AtsSnapshot> {
    return apiFetch<AtsSnapshot>({ path: '/ats/snapshot' })
  },
  disconnect(): Promise<void> {
    return apiFetch<void>({ path: '/ats', method: 'DELETE' })
  },
}

export function useAtsStatus() {
  return useQuery({ queryKey: ['ats', 'status'], queryFn: atsApi.status, staleTime: 60_000 })
}

export function useConnectAts() {
  return useMutation({
    mutationFn: atsApi.connect,
    // Le retour se fait par redirection : la page revient sur /integrations?ats=…, le statut est relu à ce moment-là.
    onSuccess: ({ url }) => {
      window.location.assign(url)
    },
  })
}

/** #4688.11 — « Vérifier la connexion » : joignable ou non, et les `meta.warnings` rendus par l'éditeur. */
export function useTestAts() {
  return useMutation({ mutationFn: atsApi.test })
}

export function useDisconnectAts() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: atsApi.disconnect,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ats'] })
      void queryClient.invalidateQueries({ queryKey: ['routines'] })
    },
  })
}

/**
 * Les demandes d'écriture dans l'ERP en attente de validation.
 *
 * Elles vivent dans un module à part (l'ERP n'est pas un CRM) mais s'affichent
 * au MÊME endroit que les approbations de l'Action OS : pour un responsable, il
 * n'y a qu'une question — « qu'est-ce qui attend ma validation ? » — et deux
 * files séparées à surveiller garantissent qu'une des deux sera oubliée.
 */
export const atsWriteApi = {
  pending(): Promise<AtsWriteRequestView[]> {
    return apiFetch<AtsWriteRequestView[]>({ path: '/ats/write-requests' })
  },
  decide(id: string, decision: 'approve' | 'reject'): Promise<AtsWriteRequestView> {
    return apiFetch<AtsWriteRequestView>({
      path: `/ats/write-requests/${id}/decision`,
      method: 'POST',
      body: { decision },
    })
  },
  /** #2864 — confier à un collègue du même espace (`null` = retirer). */
  assign(id: string, assigneeId: string | null): Promise<AtsWriteRequestView> {
    return apiFetch<AtsWriteRequestView, { assigneeId: string | null }>({
      path: `/ats/write-requests/${id}/assign`,
      method: 'POST',
      body: { assigneeId },
    })
  },
  /** #2856 — reporter jusqu'à cette date (`null` réveille la demande). */
  snooze(id: string, until: string | null): Promise<AtsWriteRequestView> {
    return apiFetch<AtsWriteRequestView, { until: string | null }>({
      path: `/ats/write-requests/${id}/snooze`,
      method: 'POST',
      body: { until },
    })
  },
}

export const atsWriteKeys = { pending: ['ats', 'write-requests'] as const }

export function useAtsWriteRequests(enabled = true) {
  return useQuery({
    queryKey: atsWriteKeys.pending,
    queryFn: atsWriteApi.pending,
    enabled,
    staleTime: 30_000,
    // Sans ERP branché la route répond une liste vide ; une erreur réseau ne doit
    // pas faire disparaître les approbations voisines de l'écran.
    retry: 1,
  })
}

export function useDecideAtsWrite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'approve' | 'reject' }) => atsWriteApi.decide(id, decision),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: atsWriteKeys.pending })
    },
  })
}

/** #2864 — reste du lot précédent : confier une écriture ERP à un collègue. */
export function useAssignAtsWrite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, assigneeId }: { id: string; assigneeId: string | null }) => atsWriteApi.assign(id, assigneeId),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: atsWriteKeys.pending })
    },
  })
}

/** #2856 — reste du lot précédent : reporter une écriture ERP en attente. */
export function useSnoozeAtsWrite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, until }: { id: string; until: string | null }) => atsWriteApi.snooze(id, until),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: atsWriteKeys.pending })
    },
  })
}
