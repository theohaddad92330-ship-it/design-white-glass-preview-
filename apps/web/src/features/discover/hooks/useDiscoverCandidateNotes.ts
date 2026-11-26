import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { DiscoverCandidateNote, DiscoverCandidateNotesResponse } from '@bellum/contracts'
import { discoverApi } from '@/features/discover/api/discover-api'

/* ------------------------------------------------------------------ */
/*  #2151.59 — une note libre sur un candidat Découvrir.                 */
/*                                                                     */
/*  Même clé de requête que `useDiscoverPeople` (préfixe `['discover',   */
/*  …]`) : le SIREN est la clé stable, avant comme après que le candidat */
/*  devienne un compte (`DiscoverCandidateNotesService.claimForAccount`, */
/*  côté serveur).                                                      */
/* ------------------------------------------------------------------ */

function candidateNotesKey(siren: string) {
  return ['discover', 'candidateNotes', siren] as const
}

export function useDiscoverCandidateNotes(siren: string): UseQueryResult<DiscoverCandidateNotesResponse> {
  return useQuery<DiscoverCandidateNotesResponse>({
    queryKey: candidateNotesKey(siren),
    enabled: Boolean(siren),
    queryFn: ({ signal }) => discoverApi.notes.list(siren, signal),
  })
}

export function useCreateDiscoverCandidateNote(siren: string) {
  const { t } = useTranslation('discover')
  const queryClient = useQueryClient()
  return useMutation<DiscoverCandidateNote, Error, { body: string }>({
    mutationFn: ({ body }) => discoverApi.notes.create(siren, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: candidateNotesKey(siren) })
    },
    onError: () => toast.error(t('card.notes.addError')),
  })
}
