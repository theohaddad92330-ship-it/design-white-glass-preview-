import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { PlacedRolesInferenceResponse } from '@bellum/contracts'
import { esnProfileApi, esnProfileKeys } from '@/features/profile/api'
import { useSession } from '@/lib/hooks/use-session'

/** Métiers placés DÉDUITS du contexte de l'espace (décision Louis 11/10/2026). */
export function usePlacedRolesInference() {
  const { user } = useSession()
  return useQuery<PlacedRolesInferenceResponse>({
    queryKey: esnProfileKeys.placedRolesInference,
    queryFn: () => esnProfileApi.getPlacedRolesInference(),
    enabled: !!user,
    staleTime: 60_000,
  })
}

/** « Retirer » un métier déduit : la réponse est la liste à jour. */
export function useDismissInferredPlacedRole() {
  const queryClient = useQueryClient()
  return useMutation<PlacedRolesInferenceResponse, Error, string>({
    mutationFn: role => esnProfileApi.dismissInferredPlacedRole(role),
    onSuccess: next => queryClient.setQueryData(esnProfileKeys.placedRolesInference, next),
  })
}
