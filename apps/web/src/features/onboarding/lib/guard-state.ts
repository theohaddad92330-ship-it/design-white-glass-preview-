import type { OnboardingState } from '../api'

/**
 * Lecture de l'état d'onboarding pour un garde de route, qui ne peut PAS
 * échouer.
 *
 * Incident prod : les gardes de `/onboarding`, `/onboarding/plan` et
 * `/onboarding/company` appelaient `onboardingApi.getState()` sans filet. Un
 * 429 remontait donc en erreur non-redirect, TanStack Router basculait sur son
 * écran « Oups », et le rendu de cet écran relançait le garde — donc une
 * nouvelle requête, donc un nouveau 429. Douze allers-retours mesurés avant que
 * l'onglet ne se stabilise ; `/accounts` et `/dashboard` redirigeant tous deux
 * vers `/onboarding`, l'application entière devenait inaccessible.
 *
 * `null` veut dire « on ne sait pas », jamais « pas d'onboarding » : l'appelant
 * doit choisir une destination sûre plutôt que de conclure.
 */
export async function readOnboardingStateOrUnknown(
  read: () => Promise<OnboardingState>,
): Promise<OnboardingState | null> {
  try {
    return await read()
  } catch {
    return null
  }
}
