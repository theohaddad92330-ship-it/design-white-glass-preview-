import { useNavigate } from '@tanstack/react-router'
import { useOnboardingState, useRequestOnboardingRefresh } from '@/features/onboarding/hooks/useOnboarding'
import { useCredits } from '@/features/credits/hooks/useCredits'
import { useProductTourStore } from '@/features/product-tour/product-tour-store'

/**
 * #2021 — recette écran 26/09 : Louis, déjà onboardé, n'a trouvé aucun moyen
 * de revoir la grille premium (`OnboardingWizard`, trois colonnes dont la
 * carte « Besoin d'aide ? ») depuis son propre espace — `/onboarding` le
 * renvoie vers `/chat`, et `Réglages › Profil` n'ouvrait la porte QUE depuis
 * `ReconfigureAnswersSection`, plus bas sur la page. Le geste existait déjà
 * (#2022, `POST /onboarding/refresh` puis `/onboarding`) : ce hook en extrait
 * le DÉCLENCHEUR (un seul, GA-26) pour qu'un second point d'entrée — plus
 * visible, depuis l'éditeur d'une étape (`ProfileStagePage`) — puisse le
 * réutiliser sans le redéfinir.
 *
 * #2021 (recette écran 27/09/2026) — réfuté sur l'espace RÉEL de Louis : ni ce
 * lien ni son jumeau (`ReconfigureAnswersSection`) ne s'affichaient, parce que
 * son statut d'onboarding n'était NI `refresh_required` NI un état terminal
 * (`completed`/`activated`) — un des huit statuts intermédiaires du parcours
 * fin (`identity_in_progress` → … → `first_value_ready`). DÉCISION TRANCHÉE
 * (Louis 27/09/2026) : un utilisateur déjà PASSÉ par l'onboarding — tout
 * statut postérieur à `not_started` — voit TOUJOURS ce lien hors démo ; seul
 * l'espace démo le cache. `ONBOARDING_TRANSITIONS` (API,
 * `onboarding.service.ts`) a été élargi dans le même lot pour que le
 * déclencheur (`POST /onboarding/refresh`) accepte ces statuts — un lien
 * visible vers un geste que le serveur refuserait serait pire que son
 * absence.
 *
 * #2021 (recette démo 03/10/2026, DÉCISION TRANCHÉE — brief N08, 07/10/2026) —
 * le lien était ABSENT en démo (`!isDemo` l'excluait purement et simplement).
 * Il reste visible en démo, mais `trigger()` y ouvre la visite guidée
 * EXISTANTE (`useProductTourStore`, déjà montée à la racine via
 * `<ProductTour />`) au lieu du vrai flux d'onboarding : l'espace démo est
 * PARTAGÉ, et `POST /onboarding/refresh` y écrirait `refresh_required` pour
 * le prospect SUIVANT, qui atterrirait sur un questionnaire qu'il n'a pas
 * demandé. La visite guidée est un état client pur (zustand) — aucun appel
 * réseau, donc rien n'est écrit dans l'espace partagé.
 */
export function useReconfigureOnboarding() {
  const navigate = useNavigate()
  const { data: state } = useOnboardingState()
  const { data: credits } = useCredits()
  const refresh = useRequestOnboardingRefresh()
  const startTour = useProductTourStore(s => s.start)

  const status = state?.status
  // Espace de démonstration : PARTAGÉ entre prospects, aucune porte vers un
  // geste qui change son état pour le visiteur suivant.
  const isDemo = credits?.is_demo === true
  // `refresh_required` n'a aucun sens en démo (aucune reconfiguration réelle
  // n'y est jamais demandée) : jamais affiché là, quel que soit l'état lu.
  const alreadyRequested = !isDemo && status === 'refresh_required'
  // Postérieur au DÉMARRAGE : tout statut sauf `not_started` (état absent) et
  // `undefined` (état pas encore chargé) — cf. décision ci-dessus. Hors de
  // propos en démo : le lien y reste visible quel que soit le statut lu,
  // puisqu'il n'ouvre jamais le vrai flux.
  const startedOnboarding = status != null && status !== 'not_started'
  const available = isDemo || startedOnboarding

  const trigger = async (): Promise<boolean> => {
    if (isDemo) {
      startTour()
      return true
    }
    try {
      await refresh.mutateAsync()
      navigate({ to: '/onboarding' })
      return true
    } catch {
      return false
    }
  }

  return { available, alreadyRequested, pending: refresh.isPending, trigger }
}
