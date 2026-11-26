import { useMutation } from '@tanstack/react-query'
import type { CreateEsnProfileCorrectionRequest, EsnProfileCorrectionRequest } from '@bellum/contracts'
import { esnProfileApi } from '@/features/profile/api'

/**
 * #2018.7 — signaler qu'un champ ENTREPRISE est faux, sans l'écraser.
 *
 * Aucune invalidation de `esnProfileKeys.mine` en succès : le signalement
 * n'ÉCRIT rien dans `EsnAnswers` (`EsnProfileCorrectionRequestService`
 * n'injecte aucun dépôt du profil côté API), donc rien dans le cache local
 * du profil n'a changé — recharger le ferait croire à un effet qui n'a pas
 * eu lieu.
 */
export function useReportCorrection() {
  return useMutation<EsnProfileCorrectionRequest, Error, CreateEsnProfileCorrectionRequest>({
    mutationFn: dto => esnProfileApi.reportCorrection(dto),
  })
}
