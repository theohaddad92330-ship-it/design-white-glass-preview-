import { resolveCheckoutReturn } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { billingSearchSchema } from './billing-search'

/**
 * La facturation est l'écran sur lequel la page de paiement RENVOIE. Son schéma
 * de recherche est donc la porte par laquelle tout retour entre — et c'était
 * une porte fermée.
 */
describe('billingSearchSchema — la porte par laquelle les retours de paiement entrent (#2003.23)', () => {
  it("garde l'intention historique : ouvrir les offres, ouvrir la recharge", () => {
    expect(billingSearchSchema.parse({ offers: true })).toMatchObject({ offers: true })
    expect(billingSearchSchema.parse({ topup: true })).toMatchObject({ topup: true })
    expect(billingSearchSchema.parse({})).toEqual({})
  })

  /**
   * ⚠️ Le défaut le plus vicieux des deux. `topup` portait `z.boolean()`, et le
   * serveur renvoie `?topup=success` : zod ne STRIPPE pas une clé connue de
   * mauvais type, il LÈVE. Un client revenant d'une recharge payée tombait donc
   * sur l'erreur de validation de la route, pas sur sa facturation.
   */
  it("ne LÈVE pas sur ?topup=success — la même clé porte l'intention ET le retour", () => {
    expect(() => billingSearchSchema.parse({ topup: 'success' })).not.toThrow()
    expect(() => billingSearchSchema.parse({ topup: 'canceled' })).not.toThrow()
  })

  /**
   * Le test qui tient vraiment la règle : après validation, le lecteur canonique
   * doit encore savoir nommer le retour. Une clé STRIPPÉE en silence (c'était le
   * cas de `success`, `canceled` et `setup`) rendrait `none` ici — c'est-à-dire
   * « aucun retour observé » pour quelqu'un qui vient de payer.
   */
  it.each([
    [{ success: true }, 'subscription_paid'],
    [{ canceled: true }, 'subscription_abandoned'],
    [{ topup: 'success' }, 'topup_paid'],
    [{ topup: 'canceled' }, 'topup_abandoned'],
    [{ setup: 'success' }, 'card_saved'],
    [{ setup: 'canceled' }, 'card_abandoned'],
  ])('laisse passer %j, que le lecteur nomme encore après validation', (raw, expected) => {
    expect(resolveCheckoutReturn(billingSearchSchema.parse(raw))).toBe(expected)
  })

  it("n'invente aucun retour à partir de l'intention d'ouvrir la recharge", () => {
    expect(resolveCheckoutReturn(billingSearchSchema.parse({ topup: true }))).toBe('none')
    expect(resolveCheckoutReturn(billingSearchSchema.parse({ offers: true }))).toBe('none')
  })
})
