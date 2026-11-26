import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { EntityResolutionCorrection, EntityResolutionCorrectionRequest } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

/**
 * #2284.67-.69 — les corrections d'identité VERSIONNÉES de l'espace pour un
 * compte (`GET/POST /accounts/:id/entity-resolution/corrections`).
 *
 * La clé s'importe, elle ne se recopie pas : le geste l'invalide pour que la
 * carte se relise tout de suite — sans quoi l'utilisateur recliquerait sur une
 * décision déjà prise.
 */
const entityResolutionCorrectionKeys = {
  forAccount: (accountId: string) => ['accounts', 'entity-resolution-corrections', accountId] as const,
}

export function useEntityResolutionCorrections(accountId: string | undefined) {
  return useQuery<EntityResolutionCorrection[]>({
    queryKey: entityResolutionCorrectionKeys.forAccount(accountId ?? ''),
    queryFn: () =>
      apiFetch<EntityResolutionCorrection[]>({ path: `/accounts/${accountId}/entity-resolution/corrections` }),
    enabled: Boolean(accountId),
    staleTime: 60_000,
  })
}

export function useRecordEntityResolutionCorrection(accountId: string) {
  const queryClient = useQueryClient()
  return useMutation<EntityResolutionCorrection, Error, EntityResolutionCorrectionRequest>({
    mutationFn: request =>
      apiFetch<EntityResolutionCorrection, EntityResolutionCorrectionRequest>({
        path: `/accounts/${accountId}/entity-resolution/corrections`,
        method: 'POST',
        body: request,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: entityResolutionCorrectionKeys.forAccount(accountId) })
    },
  })
}
