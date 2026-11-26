import type { UserCredits } from '@/features/credits/api'
import { creditsRemaining } from '@/features/credits/lib/credits-alert'
import { hasExistingOffer } from '@/features/onboarding/lib/existing-offer'

/**
 * #2003.1 — les valeurs du PREMIER axe : le droit d'accès commercial.
 *
 * L'issue en énumère six — offre, essai, bêta, invitation, démonstration,
 * crédits. Deux s'y ajoutent, parce qu'ils EXISTENT dans le produit sans que
 * l'issue les nomme :
 *
 *  · `none` — le compte self-service qui vient de se créer. Il ne porte pas
 *    « rien » par accident : `decouverte` est le palier que pose le trigger de
 *    signup, à zéro crédit depuis le 02/09.
 *  · `unknown` — la lecture de crédits n'a pas répondu. Ce n'est ni « aucun
 *    droit » ni « zéro crédit » : si la valeur est absente, « 0 » n'est pas
 *    VRAI, et conclure « pas d'offre » enverrait un client payant choisir une
 *    offre qu'il a déjà.
 *
 * L'ORDRE de ce tableau est lu par sa garde ; il ne se réarrange pas sans
 * raison, et une valeur ne s'insère jamais au milieu.
 */
export const COMMERCIAL_ENTITLEMENT_KINDS = [
  'unknown',
  'none',
  'demonstration',
  'invitation',
  'beta',
  'trial',
  'subscription',
  'credits',
] as const

type CommercialEntitlementKind = (typeof COMMERCIAL_ENTITLEMENT_KINDS)[number]

/** Le droit d'accès commercial d'un compte, lu à un instant donné. */
type CommercialEntitlement = {
  /** DE QUOI ce compte tient son accès. Voir {@link COMMERCIAL_ENTITLEMENT_KINDS}. */
  kind: CommercialEntitlementKind
  /**
   * Crédits restants du cycle. `null` = NON MESURÉ, jamais « zéro crédit » —
   * un compte dont la requête n'a pas répondu peut très bien en avoir 250.
   * Un zéro réellement lu, lui, reste zéro : c'est l'information « plus rien ».
   */
  credits: number | null
  /** Ce compte a déjà un accès servi. Répondu par `hasExistingOffer`, jamais recalculé ici. */
  served: boolean
  /**
   * Faut-il lui montrer une sélection d'abonnement ?
   *
   * #2003.2 — « un utilisateur bêta, invité ou déjà provisionné ne voit jamais
   * une sélection d'abonnement inutile ». `unknown` répond `true` : on ne CONCLUT
   * pas « pas d'offre », mais laisser un compte neuf sans écran pendant que la
   * requête vole serait pire. C'est la REDIRECTION qui exige `served`, pas
   * l'affichage.
   */
  showsPlanSelection: boolean
}

/**
 * Le droit d'accès commercial, NOMMÉ — premier des deux états de #2003.
 *
 * Ce module ne décide rien de neuf et ne recalcule rien : « servi ? » reste
 * répondu par `hasExistingOffer` (le prédicat que lisent déjà le garde de route
 * et la reconnaissance d'arrivée) et le solde par `creditsRemaining` (la
 * dérivation canonique). Deux chemins qui referaient l'une ou l'autre
 * divergeraient — c'est exactement ce qui a fait compter à la pastille de
 * crédits un pool plus petit que le vrai.
 *
 * Ce qu'il ajoute, et que le booléen ne pouvait pas porter : le POURQUOI. Un
 * invité, un partenaire bêta et un abonné payant sont tous « servis », et
 * aucun des trois ne doit lire le même écran (#2014.1).
 *
 * L'ordre des branches compte. `is_demo` passe AVANT le palier : une salle de
 * démonstration porte un palier réellement vendu depuis
 * `1791594612903-DemoRoomsOnSoldPlan`, elle se lirait donc comme un abonnement.
 * `is_billing_owner === false` passe avant lui aussi : l'API résout la
 * facturation sur le PROPRIÉTAIRE de l'espace, si bien qu'un invité lit le
 * palier de quelqu'un d'autre.
 */
export function deriveCommercialEntitlement(credits: UserCredits | null | undefined): CommercialEntitlement {
  if (!credits) {
    return { kind: 'unknown', credits: null, served: false, showsPlanSelection: true }
  }

  const served = hasExistingOffer(credits)
  // Le palier SEUL suffit-il à servir ce compte ? On le demande au même
  // prédicat plutôt que de recopier ici le code du palier de signup : une
  // constante recopiée est une constante qui divergera le jour où elle change.
  const planAlone = hasExistingOffer({ ...credits, accounts_used: 0 })

  const kind: CommercialEntitlementKind =
    credits.is_demo === true
      ? 'demonstration'
      : credits.is_billing_owner === false
        ? 'invitation'
        : credits.plan === 'beta'
          ? 'beta'
          : credits.plan === 'trial'
            ? 'trial'
            : planAlone
              ? 'subscription'
              : served
                ? 'credits'
                : 'none'

  return {
    kind,
    credits: creditsRemaining(credits),
    served,
    // `unknown` répond `true` lui aussi — mais il est déjà sorti plus haut, et
    // le répéter ici serait une comparaison que TypeScript sait impossible.
    showsPlanSelection: kind === 'none',
  }
}
