import { describe, expect, it } from 'vitest'
import { phraseApercu } from './ownership-transfer-panel.logic'

const BASE = {
  workspaceName: 'Alpha ESN',
  currentOwner: { userId: 'u1', email: 'ancien@alpha.fr' },
  newOwner: { userId: 'u2', email: 'nouveau@alpha.fr' },
  candidates: [],
}

describe('phraseApercu (#4158.33)', () => {
  it('un refus porte le message de l’API tel quel (Stripe, non-admin…)', () => {
    const phrase = phraseApercu({
      ...BASE,
      plan: { ok: false, code: 'stripe_billing', message: 'Cet espace est facturé par Stripe.' },
    })
    expect(phrase).toEqual({ autorise: false, texte: 'Cet espace est facturé par Stripe.' })
  })

  it('un transfert possible nomme les deux personnes, en clair, et dit que le pool suit', () => {
    const phrase = phraseApercu({ ...BASE, plan: { ok: true, movesSubscription: true } })
    expect(phrase.autorise).toBe(true)
    expect(phrase.texte).toContain('nouveau@alpha.fr devient propriétaire de Alpha ESN')
    expect(phrase.texte).toContain('ancien@alpha.fr devient administrateur')
    expect(phrase.texte).toContain('pool de crédits')
  })

  it('sans abonnement, ne promet aucun déplacement de crédits', () => {
    const phrase = phraseApercu({ ...BASE, plan: { ok: true, movesSubscription: false } })
    expect(phrase.texte).toContain('Aucun abonnement à déplacer')
    expect(phrase.texte).not.toContain('pool de crédits')
  })
})
