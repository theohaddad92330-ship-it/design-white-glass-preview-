import type { UserCredits } from '@/features/credits/api'
import type { OnboardingState } from '@/features/onboarding/api'
import { needsOnboarding } from '@/features/onboarding/lib/onboarding-gate'
import { resolveDefaultLandingRoute, type DefaultView } from '@/features/preferences/preferences-provider'

/** Ce qu'il faut, en plus de l'état d'onboarding, pour dériver la destination
 *  « normale » — exactement ce que lit `HomePage` : le mobile et la
 *  préférence de démarrage. */
export type LandingContext = {
  isMobile: boolean
  defaultView: DefaultView
}

/**
 * Où atterrit un compte qui vient de s'authentifier — LE calcul, partagé par
 * les deux portes d'entrée : le mot de passe (`useRedirectAfterAuth`) et le
 * rebond OAuth (`useOauthCallback`).
 *
 * Il n'existait que du côté mot de passe. Le rebond OAuth, lui, portait un
 * `onboardingCompleted = false` en dur avec un TODO : **tout** utilisateur qui
 * se connectait avec Google repartait dans le questionnaire, y compris celui
 * qui venait de le terminer. Le compte et le palier étaient reconnus à
 * l'écran ; le produit lui redemandait quand même qui il était.
 *
 * #1786 — la destination « ce compte n'a pas besoin du questionnaire »
 * n'est PLUS `/dashboard` en dur : elle vient de `resolveDefaultLandingRoute`,
 * LA MÊME dérivation que celle de `HomePage` (Laura sur mobile, sinon la vue
 * de démarrage choisie dans Préférences — dont le défaut est désormais Laura).
 * Corriger seulement `HomePage` n'aurait couvert que l'arrivée sur `/` : la
 * connexion normale, elle, ne passe jamais par cet écran.
 *
 * `null` sur l'état d'onboarding veut dire « lecture en échec », jamais
 * « c'est faux » : sans état lisible, on renvoie vers la destination normale —
 * l'écran normal de l'application, dont le garde d'onboarding refera la
 * lecture. Se tromper ici coûte un questionnaire non proposé ; l'inverse
 * coûte l'accès au produit.
 */
export function resolveLandingFrom(
  state: Pick<OnboardingState, 'status' | 'skipped_at'> | null,
  credits: UserCredits | null,
  landing: LandingContext,
): string {
  if (state === null) return resolveDefaultLandingRoute(landing.isMobile, landing.defaultView)
  return needsOnboarding({
    status: state.status,
    credits,
    // Le report EXPLICITE (« Plus tard », §13). C'est la seule sortie hors
    // complétion : un palier prouve un droit commercial, pas une réponse au
    // questionnaire — et c'est ce raccourci-là qui faisait sauter l'onboarding
    // à tous les comptes bêta provisionnés avec une offre.
    skippedAt: state.skipped_at ?? null,
  })
    ? '/onboarding'
    : resolveDefaultLandingRoute(landing.isMobile, landing.defaultView)
}
