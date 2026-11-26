import type { LinkedInMandateView, LinkedInSendStatusView, LinkedInSendView } from '@bellum/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

/**
 * #4737 K2 — l'envoi LinkedIn SOUS MANDAT. Le corps du message part dans la requête d'envoi et ne revient
 * jamais : aucune des formes ci-dessous n'a de champ pour lui.
 */
const sendStatusKey = ['linkedin', 'send-status'] as const

export const linkedinSendApi = {
  status(): Promise<LinkedInSendStatusView> {
    return apiFetch<LinkedInSendStatusView>({ path: '/linkedin/send-status' })
  },
  grant(body: { validUntil: string }): Promise<LinkedInMandateView> {
    return apiFetch<LinkedInMandateView>({ path: '/linkedin/mandate', method: 'POST', body })
  },
  revoke(mandateId: string): Promise<LinkedInMandateView> {
    return apiFetch<LinkedInMandateView>({ path: `/linkedin/mandate/${mandateId}/revoke`, method: 'POST' })
  },
  send(body: { contactId: string; body: string }): Promise<LinkedInSendView> {
    return apiFetch<LinkedInSendView>({ path: '/linkedin/send', method: 'POST', body })
  },
}

export function useLinkedinSendStatus() {
  return useQuery({ queryKey: sendStatusKey, queryFn: linkedinSendApi.status, staleTime: 15_000 })
}

export function useGrantLinkedinMandate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: linkedinSendApi.grant,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: sendStatusKey }),
  })
}

export function useRevokeLinkedinMandate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: linkedinSendApi.revoke,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: sendStatusKey }),
  })
}

export function useSendLinkedinMessage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: linkedinSendApi.send,
    // Le reste du jour bouge dès qu'un envoi est compté (ou refusé).
    onSettled: () => void queryClient.invalidateQueries({ queryKey: sendStatusKey }),
  })
}
