import { useQuery } from '@tanstack/react-query'
import type { OnboardingStateResponse } from '@bellum/contracts'
import { onboardingApi, onboardingKeys } from '@/features/onboarding/api'
import { needsOnboarding } from '@/features/onboarding/lib/onboarding-gate'
import { useCredits } from '@/features/credits/hooks/useCredits'
import { useSession } from '@/lib/hooks/use-session'
import { useDeferredEnabled } from '@/lib/hooks/use-deferred-enabled'

/**
 * Ce compte doit-il être renvoyé au questionnaire ?
 *
 * Le hook répondait sur le seul `status === 'completed'`, alors que le garde de
 * `/onboarding` tranchait, lui, sur l'offre déjà servie. Un compte à cheval sur
 * les deux — questionnaire en cours ET analyse consommée — faisait rebondir la
 * page client vers `/onboarding`, qui la renvoyait au dashboard, sans fin. Les
 * deux lisent maintenant `needsOnboarding`, le même prédicat sur les mêmes
 * données.
 *
 * `undefined` = on ne sait pas encore (lecture en vol ou en échec) ; l'appelant
 * ne doit alors rediriger nulle part.
 */
export function useOnboardingStatus(options: { deferred?: boolean } = {}): {
  needsOnboarding: boolean | undefined
  isLoading: boolean
} {
  const { user } = useSession()
  const credits = useCredits()
  // perf P3 — `deferred` : l'appelant ne CONDITIONNE rien (un guide, pas une
  // redirection) : la lecture attend que la page soit calme. Les portes de
  // redirection l'appellent sans option et lisent tout de suite ; même clé de
  // requête, donc UNE seule requête dans les deux cas.
  const calm = useDeferredEnabled()

  const state = useQuery<OnboardingStateResponse, Error>({
    queryKey: onboardingKeys.state,
    queryFn: () => onboardingApi.getState(),
    enabled: !!user && (!options.deferred || calm),
    staleTime: 30_000,
  })

  if (state.isLoading || credits.isLoading) return { needsOnboarding: undefined, isLoading: true }
  // Lecture différée et pas encore partie : « on ne sait pas », jamais « compte neuf ».
  if (options.deferred && state.data === undefined && !state.isError) {
    return { needsOnboarding: undefined, isLoading: true }
  }

  // Lecture en ÉCHEC (429, panne, réseau) : on n'envoie NULLE PART. Le garde de
  // `/onboarding` fait le choix symétrique — sans état, il renvoie au tableau de
  // bord. Si celui-ci concluait « questionnaire » sur la même absence de
  // données, les deux se renverraient la balle : exactement la boucle qu'on
  // vient d'éteindre, sous un autre déguisement. Se tromper ici coûte un
  // questionnaire non proposé ; l'inverse coûte l'accès à l'application.
  if (state.isError) return { needsOnboarding: false, isLoading: false }

  // MÊME raisonnement sur les crédits, qui manquait : `credits.data` est
  // `undefined` aussi bien « en échec » que « pas d'offre », et le prédicat
  // lisait les deux comme un compte neuf. Un abonné dont le `GET /credits/me`
  // prenait un 429 était donc rebondi vers `/onboarding`, puis vers l'écran de
  // tarifs. Sans lecture, on ne renvoie personne au questionnaire.
  if (credits.isError) return { needsOnboarding: false, isLoading: false }

  // perf P3 (régression E2E intermittente) — ni chargement ni erreur MAIS pas
  // de donnée : requête en pause, pas encore partie, clé lue entre deux
  // observateurs. C'est « on ne sait pas », JAMAIS « compte neuf » : sans
  // lecture RÉUSSIE des deux, la porte ne conclut pas (`undefined` = ne
  // rediriger nulle part). Avant, `status: undefined` rebondissait vers
  // /onboarding un compte dont l'API répondait `completed`.
  if (state.data === undefined || credits.data === undefined) {
    return { needsOnboarding: undefined, isLoading: true }
  }

  return {
    needsOnboarding: needsOnboarding({
      status: state.data.status,
      credits: credits.data,
      // Le report explicite du questionnaire (§13). Il remplace le raccourci
      // « ce compte a déjà une offre » : un palier prouve un droit commercial,
      // pas une réponse au questionnaire.
      skippedAt: state.data.skipped_at ?? null,
      // #2021 — distingue, à `refresh_required`, un utilisateur déjà onboardé
      // (le bandeau de reprise prend le relais) d'un utilisateur qui n'a
      // jamais terminé le questionnaire (reste redirigé).
      firstCompletedAt: state.data.first_completed_at ?? null,
    }),
    isLoading: false,
  }
}
