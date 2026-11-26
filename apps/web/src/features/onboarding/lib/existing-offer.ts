import type { UserCredits } from '@/features/credits/api'
import type { PlanCatalog } from '@/lib/plans'

/**
 * Le palier que le trigger de signup pose sur un compte créé en self-service.
 * Toute AUTRE valeur veut dire « ce compte a déjà été servi » : essai accordé,
 * abonnement payant, compte bêta, ou siège dans un espace de travail payant
 * (l'API résout la facturation sur le PROPRIÉTAIRE de l'espace, donc un membre
 * lit le palier de son espace — pas un `decouverte` trompeur).
 */
const SIGNUP_PLAN = 'decouverte'

/** L'offre déjà servie, telle qu'on peut la NOMMER à l'utilisateur : rien ici
 *  n'est recopié en dur — le nom vient du catalogue live. Aucun compteur ni quota
 *  (Louis 22/10, #4463 : plus aucun crédit affiché dans l'app).
 *  Non exporté : uniquement consommé ici comme type de retour (les appelants
 *  lisent la forme inférée). */
type ExistingOffer = {
  /** Code serveur du palier (`team`, `trial`, `beta`…). */
  planId: string
  /** Nom d'affichage du catalogue LIVE ; à défaut le code serveur (jamais un
   *  nom inventé côté front, qui mentirait après un renommage opérateur). */
  planLabel: string
  /** Vrai quand le caller occupe un siège sans porter la facturation. */
  isSeat: boolean
}

/**
 * Ce compte a-t-il déjà un palier servi ?
 *
 * Prédicat PARTAGÉ par le garde de `/onboarding/plan` (qui saute l'écran de
 * choix) et par la reconnaissance affichée à l'arrivée : les deux doivent dire
 * la même chose, sinon on redirige quelqu'un sans jamais lui expliquer pourquoi.
 *
 * Une lecture de crédits absente (échec réseau) répond `false` : on préfère
 * montrer l'écran de choix à un vrai nouveau venu plutôt que de le sauter.
 */
export function hasExistingOffer(credits: UserCredits | null | undefined): boolean {
  if (!credits) return false
  return (Boolean(credits.plan) && credits.plan !== SIGNUP_PLAN) || (credits.accounts_used ?? 0) > 0
}

/**
 * Décrit l'offre déjà servie pour l'annoncer — ou `null` s'il n'y en a pas.
 *
 * Le nom vient du catalogue opérateur (`GET /credits/plans`) : un renommage en
 * backoffice doit atteindre cet écran.
 */
export function describeExistingOffer(
  credits: UserCredits | null | undefined,
  catalog?: PlanCatalog,
): ExistingOffer | null {
  if (!credits || !hasExistingOffer(credits)) return null
  const planId = credits.plan
  return {
    planId,
    planLabel: catalog?.[planId]?.label || planId,
    // Champ absent = charge utile ancienne ou compte solo : propriétaire.
    isSeat: credits.is_billing_owner === false,
  }
}
