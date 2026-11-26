/**
 * #2214.23 — LE JUGEMENT, SÉPARÉ DE L'EFFET (même patron que
 * `guide-step-gate.ts` : décider ne demande aucun DOM, aucun store, aucune
 * requête réseau — juste les quatre faits qui suivent).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI `/chat`, ET CE QUE ÇA N'ATTRAPE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * `/chat` est la destination par défaut après l'onboarding
 * (`resolveDefaultLandingRoute`) pour un compte qui n'a pas changé sa
 * préférence de démarrage — le cas le plus fréquent aujourd'hui. Un compte
 * dont la vue de démarrage est une autre page ne verra pas ce guide tant
 * qu'il n'ouvre pas `/chat` lui-même : personne n'y est EMMENÉ (GA-371, le
 * guide ne navigue jamais seul), donc pas de guide qui s'écarte en silence à
 * chaque connexion. Câbler les « trois portes de départ » que le tri du
 * 25/09 évoquait est l'ordonnanceur multi-écrans que les lots précédents ont
 * refusé de construire à l'aveugle — tranché sans Louis : cette version-ci
 * couvre le cas par défaut, prouvé, plutôt que rien.
 *
 * ⚠️ `alreadyShown` n'a pas de fenêtre de fraîcheur (contrairement à
 * l’ancien `connector-hint-seen`, retiré par #4513) : un guide de bienvenue qui se redéclencherait
 * après 7 jours ne serait plus « le premier succès » de personne. Un compte
 * déjà onboardé avant que ce guide existe le verra une fois à sa prochaine
 * visite sur `/chat` — c'est la même dette que tout guide ajouté après coup
 * (aucun horodatage de complétion n'existe côté API pour la distinguer d'une
 * vraie primo-arrivée, cf. `OnboardingStateResponse`) — assumée, pas cachée.
 */
export function shouldStartFirstSuccessGuide(input: {
  route: string
  needsOnboarding: boolean | undefined
  alreadyShown: boolean
  hasActiveGuideSession: boolean
}): boolean {
  if (input.route !== '/chat') return false
  if (input.needsOnboarding !== false) return false
  if (input.alreadyShown) return false
  if (input.hasActiveGuideSession) return false
  return true
}
