import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ProfileContextResponse } from '@bellum/contracts'
import { profileContextApi, profileContextKeys } from '@/features/profile-context/api'
import { trackOnboardingAuditValidated } from '@/lib/product-tracker'

/** #2085.8 — le motif de route de l'écran d'audit (catalogue :
 *  `product-screens-catalog.ts`), seul appelant de cette mutation
 *  (`ValidateContextStatus.tsx`, monté sur `/settings/profile/audit`). */
const PROFILE_AUDIT_SCREEN = '/settings/profile/audit'

/**
 * D9 — décision Louis 14/09/2026 : valider le contexte commercial.
 *
 * Le clic EST la décision (geste utilisateur = auto-approuvé) : cette
 * mutation part sans confirmation, et sa réponse REMPLACE directement le
 * cache de `GET /profile-context/me` — l'écran passe à « Validé le … par … »
 * sans second aller-retour ni rechargement de page.
 */
export function useValidateProfileContext() {
  const queryClient = useQueryClient()
  return useMutation<ProfileContextResponse, Error, void>({
    mutationKey: ['profile-context', 'validate'],
    mutationFn: () => profileContextApi.validate(),
    onSuccess: data => {
      queryClient.setQueryData(profileContextKeys.me, data)
      trackOnboardingAuditValidated(PROFILE_AUDIT_SCREEN)
    },
  })
}
