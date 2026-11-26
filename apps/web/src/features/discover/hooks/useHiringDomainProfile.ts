import { useMemo } from 'react'
import type { SalesProfileForRelevance } from '@bellum/contracts'
import { useEsnProfile } from '@/features/profile/hooks/useEsnProfile'
import { relevanceProfileFromAnswers } from '@/features/discover/lib/discover-why-now'
import { usePlacedRolesInference } from '@/features/profile/hooks/usePlacedRolesInference'

/**
 * #3901.w — le profil DÉCLARÉ (`placed_roles`) qui décide du secteur des recrutements,
 * pour les jumeaux de Découvrir (veille du compte, /mes-cibles). Même lecture que
 * `Discover.tsx` (`relevanceProfileFromAnswers`) : profil pas encore chargé → `undefined`
 * → libellés et ordre d'avant, sans ligne.
 */
export function useHiringDomainProfile(): SalesProfileForRelevance | undefined {
  return useHiringDomainProfileState().profile
}

/**
 * #4284.10 (recette 21/10, L2d) — le profil ET son état. Tant qu'il charge : `profile` indéfini, AUCUN verdict
 * (ni marque « hors de ton métier » ni « dans ton métier » deviné). S'il échoue et que rien n'est déclaré :
 * `failed` — l'écran le DIT, jamais un faux « dans ton métier ».
 */
export function useHiringDomainProfileState(): { profile: SalesProfileForRelevance | undefined; failed: boolean } {
  const { data } = useEsnProfile()
  const { data: inference, isPending, isError } = usePlacedRolesInference()
  // #3901.p — rien de déclaré et la déduction pas encore lue : profil inconnu (jamais un « muet » qui clignote).
  const declared = (data?.placed_roles ?? []).some(role => role.trim().length > 0)
  return useMemo(
    () => ({
      profile: !declared && (isPending || isError) ? undefined : relevanceProfileFromAnswers(data, inference?.roles),
      failed: !declared && isError,
    }),
    [data, inference, isPending, isError, declared],
  )
}
