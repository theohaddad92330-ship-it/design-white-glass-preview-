import { describe, expect, it } from 'vitest'
import type { UserCredits } from '@/features/credits/api'
import { announceCheckoutReturn } from './checkout-return-announcement'

/** Un solde lisible, minimal — les champs que la dérivation canonique lit. */
function credits(over: Partial<UserCredits> = {}): UserCredits {
  return {
    user_id: 'u1',
    plan: 'growth',
    accounts_limit: 250,
    accounts_used: 0,
    credits_limit: 250,
    credits_remaining: 250,
    enrichment_credits: 250,
    ...over,
  } as UserCredits
}

/** Le compte neuf tel que le trigger de signup le pose : palier `decouverte`,
 *  zéro crédit. C'est l'état de celui qui vient de payer et dont le webhook
 *  n'a pas encore atterri. */
function freshAccount(): UserCredits {
  return credits({ plan: 'decouverte', accounts_limit: 0, credits_limit: 0, credits_remaining: 0 })
}

describe('announceCheckoutReturn — ce qu’on DIT au retour de la caisse (#2003.23, #2004.16)', () => {
  it("ne dit rien quand il n'y a aucun retour à annoncer", () => {
    expect(announceCheckoutReturn({ outcome: 'none', credits: credits() })).toBeNull()
  })

  describe('le paiement réussi — et la course avec le webhook (#2004.16)', () => {
    it("CONFIRME l'activation quand l'offre est déjà lisible sur le compte", () => {
      const announcement = announceCheckoutReturn({ outcome: 'subscription_paid', credits: credits() })
      expect(announcement).toMatchObject({ tone: 'success', activation: 'confirmed', plan: 'growth' })
    })

    /**
     * Le cœur de #2004.16. La page de paiement renvoie le client TOUT DE SUITE ;
     * ce qui crédite l'espace est le webhook `checkout.session.completed`, qui
     * est asynchrone. Entre les deux, le compte porte encore `decouverte` et
     * zéro crédit.
     */
    it("dit « activation en cours » tant que l'offre n'est pas lue — jamais « 0 crédit »", () => {
      const announcement = announceCheckoutReturn({ outcome: 'subscription_paid', credits: freshAccount() })
      expect(announcement).toMatchObject({ tone: 'success', activation: 'pending' })
      // Le zéro du compte est RÉEL, mais il décrit l'avant-paiement. L'annoncer
      // ici ferait lire « tu viens de payer, tu as 0 crédit ».
      expect(announcement).not.toHaveProperty('credits')
      expect(announcement?.plan).toBeNull()
    })

    it("n'invente aucun chiffre quand le solde n'a pas répondu", () => {
      const announcement = announceCheckoutReturn({ outcome: 'subscription_paid', credits: undefined })
      expect(announcement).toMatchObject({ tone: 'success', activation: 'pending' })
    })

    it('annonce aussi la recharge de crédits payée', () => {
      const announcement = announceCheckoutReturn({ outcome: 'topup_paid', credits: credits() })
      expect(announcement).toMatchObject({ tone: 'success', outcome: 'topup_paid' })
    })

    it('demande de RELIRE le solde — c’est ce qui a changé pour lui', () => {
      expect(announceCheckoutReturn({ outcome: 'subscription_paid', credits: freshAccount() })?.refetch).toBe(true)
      expect(announceCheckoutReturn({ outcome: 'topup_paid', credits: credits() })?.refetch).toBe(true)
    })
  })

  describe("l'abandon avant paiement — rien n'a été débité", () => {
    it("n'est ni une erreur ni un échec : un ton neutre, aucune activation", () => {
      const announcement = announceCheckoutReturn({ outcome: 'subscription_abandoned', credits: freshAccount() })
      expect(announcement).toMatchObject({ tone: 'neutral', activation: null, refetch: false })
    })

    it('vaut pour les trois caisses', () => {
      expect(announceCheckoutReturn({ outcome: 'topup_abandoned', credits: credits() })?.tone).toBe('neutral')
      expect(announceCheckoutReturn({ outcome: 'card_abandoned', credits: credits() })?.tone).toBe('neutral')
    })
  })

  /**
   * Un enregistrement de carte passe par la même mécanique de caisse SANS
   * débiter un centime. L'annoncer comme un paiement enverrait quelqu'un
   * chercher un prélèvement qui n'existe pas.
   */
  it("n'annonce PAS un paiement quand une carte a seulement été enregistrée", () => {
    const announcement = announceCheckoutReturn({ outcome: 'card_saved', credits: credits() })
    expect(announcement).toMatchObject({ tone: 'success', activation: null, refetch: false })
    expect(announcement).not.toHaveProperty('credits')
  })

  it('porte une clé de traduction par issue, jamais une phrase écrite ici', () => {
    const announcement = announceCheckoutReturn({ outcome: 'subscription_abandoned', credits: credits() })
    expect(announcement?.titleKey).toBe('checkoutReturn.subscription_abandoned.title')
    expect(announcement?.bodyKey).toBe('checkoutReturn.subscription_abandoned.body')
  })

  /**
   * La distinction que #2004.16 pose : « où atterrit-il ». La page de paiement
   * le renvoie sur la facturation, mais un compte dont le questionnaire n'est
   * pas fini est réexpédié vers l'onboarding par le garde de `SettingsPage`.
   * L'annonce doit donc survivre au renvoi, pas dépendre de l'écran.
   */
  it("l'annonce ne dépend d'aucun écran : elle est calculée à partir du seul retour", () => {
    const onBilling = announceCheckoutReturn({ outcome: 'subscription_paid', credits: freshAccount() })
    const onOnboarding = announceCheckoutReturn({ outcome: 'subscription_paid', credits: freshAccount() })
    expect(onBilling).toEqual(onOnboarding)
  })
})
