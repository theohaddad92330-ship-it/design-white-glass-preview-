import type {
  LemlistCampaign,
  LemlistContactLead,
  LemlistCredentials,
  LemlistPushInput,
  LemlistPushResult,
  LemlistStatus,
} from '@bellum/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

/** #4427 — Lemlist : Bellum ajoute un contact préparé à une campagne existante, il n'envoie rien. */
export const lemlistApi = {
  status(): Promise<LemlistStatus> {
    return apiFetch<LemlistStatus>({ path: '/lemlist/status' })
  },
  connect(body: LemlistCredentials): Promise<LemlistStatus> {
    return apiFetch<LemlistStatus>({ path: '/lemlist/connect', method: 'POST', body })
  },
  disconnect(): Promise<void> {
    return apiFetch<void>({ path: '/lemlist', method: 'DELETE' })
  },
  campaigns(): Promise<LemlistCampaign[]> {
    return apiFetch<LemlistCampaign[]>({ path: '/lemlist/campaigns' })
  },
  push(body: LemlistPushInput): Promise<LemlistPushResult> {
    return apiFetch<LemlistPushResult>({ path: '/lemlist/push', method: 'POST', body })
  },
  contactLeads(contactId: string): Promise<LemlistContactLead[]> {
    return apiFetch<LemlistContactLead[]>({ path: `/lemlist/contacts/${encodeURIComponent(contactId)}/leads` })
  },
}

export function useLemlistStatus() {
  return useQuery({ queryKey: ['lemlist', 'status'], queryFn: lemlistApi.status, staleTime: 60_000 })
}

export function useConnectLemlist() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: lemlistApi.connect,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['lemlist'] }),
  })
}

export function useDisconnectLemlist() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: lemlistApi.disconnect,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['lemlist'] }),
  })
}

/** Les campagnes ne se lisent que sur demande (l'utilisateur ouvre le choix) : `enabled`. */
export function useLemlistCampaigns(enabled: boolean) {
  return useQuery({ queryKey: ['lemlist', 'campaigns'], queryFn: lemlistApi.campaigns, enabled, staleTime: 60_000 })
}

export function usePushToLemlist(contactId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (campaignId: string) => lemlistApi.push({ contactId, campaignId }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['lemlist', 'contact', contactId] }),
  })
}

/** #4427.3 — relu à l'ouverture de la fiche, seulement quand Lemlist est connecté. */
export function useLemlistContactLeads(contactId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['lemlist', 'contact', contactId],
    queryFn: () => lemlistApi.contactLeads(contactId),
    enabled,
    staleTime: 60_000,
  })
}
