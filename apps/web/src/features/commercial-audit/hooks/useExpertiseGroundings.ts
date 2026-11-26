import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  CreateExpertiseGroundingRequest,
  ExpertiseGroundingsResponse,
  UpdateExpertiseGroundingInput,
} from '@bellum/contracts'
import { expertiseGroundingsApi, expertiseGroundingsKeys } from '../api'

/** Épopée #2880 — le croisement expertise ↔ fondement et son audit à 3 états. */
export function useExpertiseGroundings() {
  return useQuery<ExpertiseGroundingsResponse>({
    queryKey: expertiseGroundingsKeys.list,
    queryFn: () => expertiseGroundingsApi.list(),
    staleTime: 30_000,
  })
}

type GroundingGesture =
  | { kind: 'create'; input: CreateExpertiseGroundingRequest }
  | { kind: 'update'; id: string; input: UpdateExpertiseGroundingInput }
  | { kind: 'archive'; id: string }

/**
 * Le clic EST la décision (geste utilisateur = auto-approuvé). La réponse
 * REMPLACE le cache de la lecture — même précédent que
 * `useCreateCommercialAuditFeedback`.
 */
export function useExpertiseGroundingGesture() {
  const queryClient = useQueryClient()
  return useMutation<ExpertiseGroundingsResponse, Error, GroundingGesture>({
    mutationKey: ['expertise-groundings', 'gesture'],
    mutationFn: gesture => {
      if (gesture.kind === 'create') return expertiseGroundingsApi.create(gesture.input)
      if (gesture.kind === 'update') return expertiseGroundingsApi.update(gesture.id, gesture.input)
      return expertiseGroundingsApi.archive(gesture.id)
    },
    onSuccess: data => {
      queryClient.setQueryData(expertiseGroundingsKeys.list, data)
    },
  })
}
