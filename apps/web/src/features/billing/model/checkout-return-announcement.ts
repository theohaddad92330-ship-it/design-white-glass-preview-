import { isPaidCheckoutReturn, type CheckoutReturnOutcome } from '@bellum/contracts'
import type { UserCredits } from '@/features/credits/api'
import { deriveCommercialEntitlement } from '@/features/plan-features/commercial-entitlement'

/**
 * Ce qu'on DIT au retour de la page de paiement — et ce qu'on refuse de dire
 * (#2003.23, #2004.16).
 *
 * **Le défaut mesuré.** Un compte neuf choisit son offre sur `/onboarding/plan`,
 * paie, et la page de paiement le renvoie sur `/billing?success=true`. Là,
 * deux choses le privaient de toute confirmation :
 *
 *  1. le schéma de recherche de `/billing` n'acceptait que `{ offers, topup }`
 *     et jetait `success` en silence ;
 *  2. `/billing` vit dans `SettingsPage`, qui réexpédie vers `/onboarding` tant
 *     que le questionnaire n'est pas fini — ce qui est le cas de quelqu'un qui
 *     vient juste de s'inscrire. Le paramètre de retour partait avec l'URL.
 *
 * Résultat : il venait de payer 199 €, et son relevé bancaire était la seule
 * trace que quelque chose s'était passé. C'est pourquoi l'annonce se calcule à
 * partir du SEUL retour observé, sans rien savoir de l'écran : elle survit au
 * renvoi au lieu d'en dépendre.
 *
 * **La course avec le webhook, et le zéro qui mentirait.** La page de paiement
 * renvoie le client tout de suite ; ce qui crédite réellement l'espace est le
 * webhook `checkout.session.completed`, asynchrone. Entre les deux, le compte
 * porte encore son palier d'avant et son solde d'avant — souvent `decouverte`
 * et zéro crédit depuis le 02/09. Ce zéro est RÉEL, mais il décrit l'AVANT :
 * l'afficher sous « paiement reçu » ferait lire « tu viens de payer, tu as 0
 * crédit ». On ne l'affiche donc pas, et on ne le remplace pas non plus par le
 * quota du palier acheté — ce serait une donnée inventée. On dit ce qui est
 * vrai : l'activation est en cours, et le solde se relit.
 */

/** Ce qu'il y a à annoncer, ou `null` quand il n'y a rien à dire. Volontairement
 *  NON exporté : seul `announceCheckoutReturn` le produit, et ses appelants le
 *  lisent par inférence. */
type CheckoutReturnAnnouncement = {
  /** Le retour observé, tel que `resolveCheckoutReturn` l'a nommé. */
  outcome: CheckoutReturnOutcome
  /**
   * `success` pour un geste abouti (paiement reçu, carte enregistrée),
   * `neutral` pour un abandon. **Jamais `danger`** : un abandon avant paiement
   * n'est pas une panne, c'est quelqu'un qui a changé d'avis, et rien n'a été
   * débité.
   */
  tone: 'success' | 'neutral'
  /**
   * Pour un retour PAYÉ seulement : l'offre est-elle déjà lisible sur le compte ?
   * `null` quand la question ne se pose pas (abandon, carte enregistrée).
   */
  activation: 'confirmed' | 'pending' | null
  /** Le palier MESURÉ sur le compte, `null` tant qu'il ne l'est pas. */
  plan: string | null
  /** Faut-il relire le solde ? Vrai des seuls retours qui le changent. */
  refetch: boolean
  titleKey: string
  bodyKey: string
}

/**
 * L'annonce due pour ce retour.
 *
 * L'état du compte est lu par `deriveCommercialEntitlement` — la dérivation
 * canonique, celle que lisent déjà l'écran des offres et le garde de route. Un
 * second chemin qui redemanderait « ce compte a-t-il une offre ? » finirait par
 * répondre autre chose.
 */
export function announceCheckoutReturn({
  outcome,
  credits,
}: {
  outcome: CheckoutReturnOutcome
  credits: UserCredits | null | undefined
}): CheckoutReturnAnnouncement | null {
  if (outcome === 'none') return null

  const keys = { titleKey: `checkoutReturn.${outcome}.title`, bodyKey: `checkoutReturn.${outcome}.body` }

  // Une carte enregistrée n'est PAS un paiement : aucun montant n'a été
  // prélevé, et rien n'a changé au solde.
  if (outcome === 'card_saved') {
    return { outcome, tone: 'success', activation: null, plan: null, refetch: false, ...keys }
  }

  if (!isPaidCheckoutReturn(outcome)) {
    // Les trois abandons. Rien débité, rien à relire, rien à activer.
    return { outcome, tone: 'neutral', activation: null, plan: null, refetch: false, ...keys }
  }

  const entitlement = deriveCommercialEntitlement(credits)
  const confirmed = entitlement.served
  return {
    outcome,
    tone: 'success',
    activation: confirmed ? 'confirmed' : 'pending',
    // Tant que l'offre n'est pas LUE sur le compte, on ne nomme pas le palier :
    // il décrirait encore l'avant-paiement. #4466 — le solde ne s'annonce plus.
    plan: confirmed ? (credits?.plan ?? null) : null,
    refetch: true,
    ...keys,
  }
}
