import { describe, expect, it } from 'vitest'
import {
  CHECKOUT_RETURN_OUTCOMES,
  isPaidCheckoutReturn,
  resolveCheckoutReturn,
  type CheckoutReturnOutcome,
} from './checkout-return.js'

describe('resolveCheckoutReturn — les états NOMMÉS du retour de la page de paiement (#2003.23)', () => {
  it("nomme un abonnement payé — c'est le seul retour qui affirme un paiement", () => {
    expect(resolveCheckoutReturn({ success: true })).toBe('subscription_paid')
    // Le paramètre arrive d'une URL : il vaut la CHAÎNE 'true' avant tout
    // parsing. Les deux formes disent la même chose.
    expect(resolveCheckoutReturn({ success: 'true' })).toBe('subscription_paid')
  })

  it("nomme l'abandon AVANT paiement — rien n'a été débité, ce n'est pas un échec", () => {
    expect(resolveCheckoutReturn({ canceled: true })).toBe('subscription_abandoned')
    expect(resolveCheckoutReturn({ canceled: 'true' })).toBe('subscription_abandoned')
  })

  it('nomme les deux retours de la recharge de crédits', () => {
    expect(resolveCheckoutReturn({ topup: 'success' })).toBe('topup_paid')
    expect(resolveCheckoutReturn({ topup: 'canceled' })).toBe('topup_abandoned')
  })

  it("nomme les deux retours de l'enregistrement de carte", () => {
    expect(resolveCheckoutReturn({ setup: 'success' })).toBe('card_saved')
    expect(resolveCheckoutReturn({ setup: 'canceled' })).toBe('card_abandoned')
  })

  /**
   * ⚠️ LA collision que ce module existe pour empêcher : `topup` porte DÉJÀ
   * l'intention « je veux acheter des crédits » (`?topup=true`, posé par la carte
   * d'upsell) et le serveur pose `?topup=success` au retour de la caisse. Même
   * clé, deux sens. Lire « true » comme un retour annoncerait un paiement qui
   * n'a jamais eu lieu.
   */
  it("ne prend PAS l'intention « ouvrir la recharge » pour un retour de paiement", () => {
    expect(resolveCheckoutReturn({ topup: true })).toBe('none')
    expect(resolveCheckoutReturn({ topup: 'true' })).toBe('none')
    expect(resolveCheckoutReturn({ offers: true })).toBe('none')
  })

  /**
   * « Non mesuré » n'est jamais « 0 », et ici : une valeur illisible n'est
   * jamais un abandon — encore moins un paiement. `none` dit « aucun retour
   * observé », ce qui est exactement ce qu'on sait.
   */
  it('ne conclut RIEN sur une valeur illisible, un objet vide ou une absence', () => {
    expect(resolveCheckoutReturn({})).toBe('none')
    expect(resolveCheckoutReturn(undefined)).toBe('none')
    expect(resolveCheckoutReturn(null)).toBe('none')
    expect(resolveCheckoutReturn({ success: 'peut-être' })).toBe('none')
    expect(resolveCheckoutReturn({ success: false })).toBe('none')
    expect(resolveCheckoutReturn({ setup: 'nimporte-quoi' })).toBe('none')
    expect(resolveCheckoutReturn({ topup: 'nimporte-quoi' })).toBe('none')
  })

  it("lit aussi une chaîne de requête complète, telle que le navigateur l'a reçue", () => {
    expect(resolveCheckoutReturn('?success=true')).toBe('subscription_paid')
    expect(resolveCheckoutReturn('?canceled=true')).toBe('subscription_abandoned')
    expect(resolveCheckoutReturn('?topup=success')).toBe('topup_paid')
    expect(resolveCheckoutReturn('?setup=canceled')).toBe('card_abandoned')
    expect(resolveCheckoutReturn('')).toBe('none')
  })

  /**
   * Un paiement passe devant un abandon : Stripe ne renvoie jamais les deux,
   * mais une URL se bricole à la main et « annulé » ne doit pas effacer un
   * paiement réellement observé.
   */
  it('fait passer le paiement observé devant tout le reste', () => {
    expect(resolveCheckoutReturn({ success: 'true', canceled: 'true' })).toBe('subscription_paid')
  })

  it('ne dit « payé » que des trois retours qui le sont', () => {
    const paid = CHECKOUT_RETURN_OUTCOMES.filter(outcome => isPaidCheckoutReturn(outcome))
    expect(paid).toEqual(['subscription_paid', 'topup_paid'])
    // `card_saved` enregistre une carte SANS débit : l'annoncer comme un
    // paiement ferait chercher un prélèvement qui n'existe pas.
    expect(isPaidCheckoutReturn('card_saved')).toBe(false)
    expect(isPaidCheckoutReturn('none')).toBe(false)
  })

  it("n'insère jamais une valeur au milieu de la liste NOMMÉE (GA-08)", () => {
    expect(CHECKOUT_RETURN_OUTCOMES.length).toBeGreaterThan(0)
    expect(CHECKOUT_RETURN_OUTCOMES[0]).toBe('none')
    const unique = new Set<CheckoutReturnOutcome>(CHECKOUT_RETURN_OUTCOMES)
    expect(unique.size).toBe(CHECKOUT_RETURN_OUTCOMES.length)
  })
})
