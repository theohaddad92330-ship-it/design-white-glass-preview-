import type { LinkedInFollowUp, LinkedInInteraction, LinkedInInteractionKind, PostIdea } from '@bellum/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

/** Le réseau professionnel, sans scraping : le commercial déclare, Bellum se souvient. */
export const linkedinApi = {
  record(body: {
    contactId: string
    kind: LinkedInInteractionKind
    occurredAt?: string
    note?: string
  }): Promise<LinkedInInteraction> {
    return apiFetch<LinkedInInteraction>({ path: '/linkedin/interactions', method: 'POST', body })
  },
  listForContact(contactId: string): Promise<LinkedInInteraction[]> {
    return apiFetch<LinkedInInteraction[]>({ path: `/linkedin/contacts/${contactId}/interactions` })
  },
  followUps(afterDays = 3): Promise<LinkedInFollowUp[]> {
    return apiFetch<LinkedInFollowUp[]>({ path: `/linkedin/follow-ups?afterDays=${afterDays}` })
  },
  postIdeas(objective?: string): Promise<PostIdea[]> {
    return apiFetch<PostIdea[]>({ path: '/linkedin/post-ideas', method: 'POST', body: { objective } })
  },
}

export function useContactInteractions(contactId: string) {
  return useQuery({
    queryKey: ['linkedin', 'interactions', contactId],
    queryFn: () => linkedinApi.listForContact(contactId),
    staleTime: 30_000,
  })
}

export function useRecordInteraction(contactId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: linkedinApi.record,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['linkedin', 'interactions', contactId] })
      // La relance se recalcule à partir du journal : elle doit bouger tout de suite.
      void queryClient.invalidateQueries({ queryKey: ['linkedin', 'follow-ups'] })
    },
  })
}

export function useLinkedInFollowUps() {
  return useQuery({
    queryKey: ['linkedin', 'follow-ups'],
    queryFn: () => linkedinApi.followUps(),
    staleTime: 60_000,
  })
}

export function usePostIdeas() {
  return useMutation({ mutationFn: (objective?: string) => linkedinApi.postIdeas(objective) })
}
