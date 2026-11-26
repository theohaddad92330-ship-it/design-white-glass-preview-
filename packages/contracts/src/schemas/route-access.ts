import { z } from 'zod'
import { can, type WorkspacePermission, type WorkspaceRole } from './workspace.js'
import { planFeatureKeySchema, type PlanFeatureKey } from './plan-features.js'

/**
 * Le contrat de route unifié (BEL-ARCH-002).
 *
 * Trois choses peuvent empêcher un écran de servir, et elles demandent trois
 * gestes différents : le PALIER (il faut changer d'offre), la PERMISSION (il
 * faut demander l'accès à quelqu'un), la CAPACITÉ (il faut connecter un outil).
 * À l'écran, elles se ressemblaient toutes — et la troisième ne devrait même
 * pas fermer la porte.
 *
 * L'information vivait éclatée en quatre endroits sans lien : le champ `feature`
 * de la navigation, un `<PlanFeatureRoute>` posé à la main dans sept fichiers de
 * route, une prop `requiredPermissions` qu'aucune route n'utilisait, et rien du
 * tout pour la capacité. Onze composants de bandeau différents en découlaient.
 *
 * Ce contrat est PUR et testable sans écran : il rend l'état, pas le rendu. La
 * décision « cette personne peut-elle ouvrir cet écran, et sinon que doit-elle
 * faire » est exactement le genre de règle qui ne doit pas être réimplémentée
 * par chaque page.
 */

export const ROUTE_ACCESS_STATES = [
  /** L'écran sert normalement. */
  'ready',
  /** L'offre ne l'ouvre pas. L'écran reste VISIBLE, avec un cadenas et le nom
   *  de l'offre qui l'ouvrirait — le masquer ferait croire qu'il n'existe pas. */
  'plan_locked',
  /** Le rôle ne le permet pas. Côté API, c'est un 403 ; côté écran, on le DIT,
   *  au lieu de rediriger en silence vers le tableau de bord. */
  'permission',
  /** Aucun outil connecté ne fournit ce que l'écran affiche. */
  'no_integration',
  /**
   * L'écran fonctionne, mais une partie de ce qu'il fait est indisponible.
   * Il s'ouvre, avec un bandeau et les actions concernées grisées — refuser
   * l'accès entier parce qu'un connecteur manque cacherait ce qui marche.
   */
  'degraded',
] as const
export const routeAccessStateSchema = z.enum(ROUTE_ACCESS_STATES)
export type RouteAccessState = (typeof ROUTE_ACCESS_STATES)[number]

export const routeContractSchema = z.object({
  path: z.string().min(1),
  /** La section de navigation qui l'accueille. */
  section: z.string().min(1),
  /** Palier requis. Absent = ouvert à toutes les offres. */
  requiredPlanFeature: planFeatureKeySchema.optional(),
  /**
   * Permission requise. Absente = tout membre y accède.
   *
   * ⚠️ PLUSIEURS PERMISSIONS SIGNIFIENT « L'UNE SUFFIT », JAMAIS « TOUTES » —
   * exactement la sémantique de `@RequirePermission(...perms)` côté serveur,
   * dont le docblock explique pourquoi elle existe : elle permet d'introduire
   * un droit plus fin sans retirer l'accès aux sièges historiques.
   *
   * Ce champ était un `string` SEUL, et trois écrans en payaient le prix : le
   * serveur ouvre `/expenses` à `finance:read` **ou** `records:write`, et aucune
   * des deux prise isolément ne couvre l'union des rôles qui y ont droit.
   * Choisir l'une aurait fermé l'écran à qui le serveur laisse entrer — un FAUX
   * REFUS, le pire résultat possible pour ce chantier, puisqu'il prive
   * quelqu'un d'un écran qu'il paie sans qu'aucun 403 ne vienne le démentir.
   */
  requiredPermission: z.union([z.string(), z.array(z.string()).min(1)]).optional(),
  /**
   * Capacités de connecteur dont l'écran a besoin. Leur absence NE FERME PAS la
   * porte : elle dégrade. C'est la différence la plus importante du contrat —
   * un écran refusé pour un connecteur manquant est un écran qu'on croit cassé.
   */
  degradesWithout: z.array(z.string()).default([]),
})
export type RouteContract = z.infer<typeof routeContractSchema>

export type RouteAccessContext = {
  role: WorkspaceRole
  extraPermissions: readonly WorkspacePermission[]
  /** Les paliers ouverts par l'offre. */
  planFeatures: readonly PlanFeatureKey[]
  /** Les capacités effectivement disponibles (outils connectés, portées
   *  accordées). */
  capabilities: readonly string[]
}

export type RouteAccess = {
  state: RouteAccessState
  /** Ce qui bloque ou dégrade, nommé — jamais un booléen nu. Un écran doit
   *  pouvoir dire QUOI manque, pas seulement que quelque chose manque. */
  missing: string[]
}

/**
 * L'état d'accès d'une route, pour cette personne, dans cet espace.
 *
 * L'ordre d'évaluation n'est pas arbitraire : palier, puis permission, puis
 * capacité. Il suit le geste que la personne devra faire, du plus lointain au
 * plus proche. Annoncer « connecte ta messagerie » à quelqu'un dont l'offre
 * n'ouvre pas l'écran lui ferait faire un travail inutile — et le contraire est
 * vrai aussi : c'est l'ordre que les guards serveur appliquent déjà, et deux
 * ordres différents donneraient deux messages différents pour un même refus.
 *
 * Le doute n'interdit pas : une liste de paliers vide veut dire « on ne sait pas
 * encore », pas « aucun ». Verrouiller sur un chargement en cours ferait
 * clignoter un cadenas sur des écrans que l'utilisateur paie.
 */
export function resolveRouteAccess(contract: RouteContract, context: RouteAccessContext): RouteAccess {
  if (contract.requiredPlanFeature && context.planFeatures.length > 0) {
    if (!context.planFeatures.includes(contract.requiredPlanFeature)) {
      return { state: 'plan_locked', missing: [contract.requiredPlanFeature] }
    }
  }

  if (contract.requiredPermission) {
    // « L'UNE suffit » — voir le champ. `some`, jamais `every` : le serveur
    // applique exactement ce prédicat, et deux prédicats différents donneraient
    // deux verdicts différents pour un même refus.
    const accepted = (
      Array.isArray(contract.requiredPermission) ? contract.requiredPermission : [contract.requiredPermission]
    ) as WorkspacePermission[]
    if (!accepted.some(permission => can(context.role, context.extraPermissions, permission))) {
      // On nomme TOUTES les permissions qui ouvriraient l'écran, pas seulement
      // la première : « demande l'un de ces droits » se règle, « demande
      // finance:read » enverrait réclamer le mauvais.
      return { state: 'permission', missing: accepted }
    }
  }

  const missingCapabilities = contract.degradesWithout.filter(capability => !context.capabilities.includes(capability))
  if (missingCapabilities.length === 0) return { state: 'ready', missing: [] }

  // TOUTES les capacités manquantes : l'écran n'a plus rien à montrer.
  // Une PARTIE seulement : il s'ouvre, dégradé. La nuance est ce qui empêche de
  // fermer un écran de missions parce que l'agenda n'est pas connecté.
  const state = missingCapabilities.length === contract.degradesWithout.length ? 'no_integration' : 'degraded'
  return { state, missing: missingCapabilities }
}
