import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  EsnTargetPersonasImportReport,
  EsnTargetPersonasResponse,
  ImportEsnTargetPersonasInput,
} from '@bellum/contracts'
import { esnProfileApi, esnProfileKeys } from '@/features/profile/api'
import { useSession } from '@/lib/hooks/use-session'

/** #3754 — les postes cibles de l'ESN, avec leur niveau décideur. */
export function useTargetPersonas() {
  const { user } = useSession()
  return useQuery<EsnTargetPersonasResponse>({
    queryKey: esnProfileKeys.targetPersonas,
    queryFn: () => esnProfileApi.getTargetPersonas(),
    enabled: !!user,
    staleTime: 60_000,
  })
}

/**
 * #3754.1 — l'import REMPLACE l'ensemble : on relit la liste, le profil (les
 * niveaux 1-2 remontent dans `decision_maker_personas`) ET les classements de
 * contacts, dont l'ordre dépend désormais de ces postes.
 */
export function useImportTargetPersonas() {
  const queryClient = useQueryClient()
  return useMutation<EsnTargetPersonasImportReport, Error, ImportEsnTargetPersonasInput>({
    mutationFn: input => esnProfileApi.importTargetPersonas(input),
    onSuccess: report => {
      if (report.imported > 0) {
        void queryClient.invalidateQueries({ queryKey: esnProfileKeys.targetPersonas })
        void queryClient.invalidateQueries({ queryKey: esnProfileKeys.mine })
        void queryClient.invalidateQueries({ queryKey: ['contacts'] })
      }
    },
  })
}
