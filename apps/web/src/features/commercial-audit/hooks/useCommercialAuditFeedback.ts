import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CommercialAuditFeedbackResponse, CreateCommercialAuditFeedbackRequest } from '@bellum/contracts'
import { useSession } from '@/lib/hooks/use-session'
import { commercialAuditFeedbackApi, commercialAuditFeedbackKeys } from '../api'

/**
 * #2075.12 / #2075.13 — la note la plus RÉCENTE par cible de l'audit
 * (`target_key`), indexée par cette même clé. `{}` = aucune note.
 */
export function useCommercialAuditFeedback() {
  const { user } = useSession()
  return useQuery<CommercialAuditFeedbackResponse>({
    queryKey: commercialAuditFeedbackKeys.list,
    queryFn: () => commercialAuditFeedbackApi.list(),
    enabled: !!user,
    staleTime: 30_000,
  })
}

/**
 * Le clic EST la décision (geste utilisateur = auto-approuvé) pour un refus ;
 * un commentaire l'est une fois le texte saisi — même précédent que
 * `useRecordAuditMoveDecision`. La réponse REMPLACE le cache de la lecture,
 * jamais un second appel.
 */
export function useCreateCommercialAuditFeedback() {
  const queryClient = useQueryClient()
  return useMutation<CommercialAuditFeedbackResponse, Error, CreateCommercialAuditFeedbackRequest>({
    mutationKey: ['commercial-audit', 'feedback', 'create'],
    mutationFn: input => commercialAuditFeedbackApi.create(input),
    onSuccess: data => {
      queryClient.setQueryData(commercialAuditFeedbackKeys.list, data)
    },
  })
}
