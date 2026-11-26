/**
 * Ce que le retour de la page de paiement DIT, nommé une seule fois (#2003.23).
 *
 * **Le trou que ce module bouche.** Le serveur construit six URLs de retour
 * (`credits.service.ts` : `?success=true` / `?canceled=true` pour l'abonnement,
 * `?topup=success|canceled` pour la recharge, `?setup=success|canceled` pour la
 * carte) et **aucune ligne du front ne les lisait**. Pire : le schéma de
 * recherche de `/billing` validait `{ offers?, topup? }` en booléens et jetait
 * tout le reste, si bien qu'un client revenu d'un paiement réussi atterrissait
 * sur un écran strictement identique à celui qu'il venait de quitter — aucune
 * confirmation, aucun changement annoncé, et son relevé bancaire comme seule
 * preuve que quelque chose s'était passé.
 *
 * **La collision que la lecture a révélée.** `topup` porte DÉJÀ l'intention
 * « ouvre la recharge » (`?topup=true`, posé par la carte d'upsell) et le
 * serveur pose `?topup=success` au retour de la caisse. Même clé, deux sens.
 * C'est exactement pourquoi la reconnaissance vit ICI et pas dans un `if` d'un
 * composant : un seul endroit sait quelle forme est un RETOUR et quelle forme
 * est une intention.
 *
 * **Ce que ce module ne sait pas, et ne prétend pas savoir.**
 *
 *  · Il ne sait rien d'un onglet fermé PENDANT le paiement sans passer par le
 *    lien de retour : aucune URL n'est alors demandée, donc il n'y a rien à
 *    lire. `none` dit « aucun retour observé », jamais « abandon ». C'est la
 *    limite honnête de l'instrument, pas un cas oublié.
 *  · Il ne sait pas si l'ARGENT est arrivé. `subscription_paid` dit « la page
 *    de paiement nous a renvoyés par son URL de succès » — ce qui crédite
 *    réellement l'espace est le webhook `checkout.session.completed`, et il est
 *    asynchrone. L'écran qui lit cette valeur doit donc RELIRE le solde et
 *    n'annoncer que ce qu'il mesure, jamais un quota déduit du palier acheté.
 */

/**
 * Les retours NOMMÉS, dans un ordre qui ne se réarrange pas et où rien ne
 * s'insère au milieu (même discipline que GA-08 sur les enums).
 *
 * `none` est en tête parce que c'est le cas par défaut — et le seul qui ne soit
 * pas un fait observé.
 */
export const CHECKOUT_RETURN_OUTCOMES = [
  /** Aucun retour observé. Ni un paiement, ni un abandon : une absence. */
  'none',
  /** L'abonnement est passé par l'URL de succès de la page de paiement. */
  'subscription_paid',
  /** Retour par l'URL d'annulation : RIEN n'a été débité. Ce n'est pas un échec. */
  'subscription_abandoned',
  /** Une recharge ponctuelle de crédits est passée par l'URL de succès. */
  'topup_paid',
  /** Recharge abandonnée avant paiement — rien débité. */
  'topup_abandoned',
  /** Une carte a été enregistrée. **Aucun débit** : ce n'est pas un paiement. */
  'card_saved',
  /** Enregistrement de carte abandonné. */
  'card_abandoned',
] as const

export type CheckoutReturnOutcome = (typeof CHECKOUT_RETURN_OUTCOMES)[number]

/**
 * Les retours qui affirment qu'UN MONTANT A ÉTÉ PRÉLEVÉ.
 *
 * `card_saved` n'en fait pas partie, et c'est le piège que cette liste existe
 * pour éviter : un enregistrement de carte passe par la même mécanique de
 * caisse sans débiter un centime. L'annoncer comme un paiement enverrait
 * quelqu'un chercher un prélèvement qui n'existe pas.
 */
const PAID_RETURNS: readonly CheckoutReturnOutcome[] = ['subscription_paid', 'topup_paid']

export function isPaidCheckoutReturn(outcome: CheckoutReturnOutcome): boolean {
  return PAID_RETURNS.includes(outcome)
}

/** Ce qu'une URL peut porter : des chaînes (le cas réel) ou déjà des booléens
 *  quand un routeur a parsé avant nous. */
type CheckoutReturnSearch = Record<string, unknown> | string | null | undefined

/**
 * Le drapeau booléen des URLs d'abonnement (`?success=true`).
 *
 * `true` (déjà parsé) et `'true'` (brut d'URL) disent la même chose. TOUT le
 * reste — `false`, `'1'`, `'oui'`, une valeur vide — vaut « non » : on ne devine
 * pas un paiement à partir d'une valeur qu'on ne reconnaît pas.
 */
function isAffirmed(value: unknown): boolean {
  return value === true || value === 'true'
}

/**
 * La valeur d'un paramètre à DEUX issues (`?topup=success|canceled`).
 *
 * ⚠️ `true` n'est ni l'une ni l'autre : c'est l'intention « ouvre cette
 * section », posée par un bouton de l'application. Elle tombe donc dans
 * `undefined`, et le retour vaut `none`.
 */
function outcomeWord(value: unknown): 'success' | 'canceled' | undefined {
  if (value === 'success') return 'success'
  if (value === 'canceled') return 'canceled'
  return undefined
}

function toRecord(search: CheckoutReturnSearch): Record<string, unknown> {
  if (search === null || search === undefined) return {}
  if (typeof search !== 'string') return search
  // `URLSearchParams` accepte indifféremment `?a=b` et `a=b`.
  return Object.fromEntries(new URLSearchParams(search).entries())
}

/**
 * Que dit ce retour ? — la seule fonction qui réponde à la question.
 *
 * L'ordre des branches est une décision : un paiement OBSERVÉ passe devant tout
 * le reste. La page de paiement ne renvoie jamais les deux drapeaux ensemble,
 * mais une URL se bricole à la main, et « annulé » ne doit pas effacer un
 * paiement dont on a la trace.
 */
export function resolveCheckoutReturn(search: CheckoutReturnSearch): CheckoutReturnOutcome {
  const params = toRecord(search)

  if (isAffirmed(params['success'])) return 'subscription_paid'

  const topup = outcomeWord(params['topup'])
  if (topup === 'success') return 'topup_paid'

  const setup = outcomeWord(params['setup'])
  if (setup === 'success') return 'card_saved'

  if (isAffirmed(params['canceled'])) return 'subscription_abandoned'
  if (topup === 'canceled') return 'topup_abandoned'
  if (setup === 'canceled') return 'card_abandoned'

  return 'none'
}
