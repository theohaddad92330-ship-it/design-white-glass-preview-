/**
 * #4364 — DROITS du lien PERMANENT vers le questionnaire.
 *
 * Ce lot AJOUTE un chemin de navigation : il dit donc qui le voit, et le refus est prouvé
 * (`onboarding-link-access.test.ts`). Aucun élargissement : le public est celui de l'entrée qui existe déjà
 * (« Réglages › Profil », `useReconfigureOnboarding` : tout statut postérieur à `not_started`), RÉDUIT de deux cas —
 *  - l'espace de démonstration, PARTAGÉ entre prospects (le geste écrirait `refresh_required` pour le suivant) ;
 *  - le membre qui attend son administrateur : il ne décrit pas l'ESN, son parcours est celui de son bandeau.
 * La route `/onboarding` n'exige aucune permission serveur (JwtGuard seul) : ce lien n'ouvre donc aucune porte
 * nouvelle, il rend visible celle qui existait.
 */
export function canSeeOnboardingLink({
  status,
  isDemo,
  awaitingCompanyAdmin,
}: {
  status: string | null | undefined
  isDemo: boolean
  awaitingCompanyAdmin: boolean
}): boolean {
  if (isDemo || awaitingCompanyAdmin) return false
  return status != null && status !== 'not_started'
}

/** L'accueil de l'application : la route d'arrivée par défaut (`landingRouteNow`). */
export function isHomeRoute(pathname: string): boolean {
  return pathname.replace(/\/+$/, '') === '/briefing'
}
