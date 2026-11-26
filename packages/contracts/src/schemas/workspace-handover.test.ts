import { describe, expect, it } from 'vitest'
import {
  PORTFOLIO_HANDOVER_KINDS,
  PORTFOLIO_PERSONAL_KINDS,
  handOverPortfolioSchema,
  handoverPlanSchema,
  handoverPlanResultSchema,
  memberPortfolioSchema,
  portfolioHandoverResultSchema,
  portfolioHoldingSchema,
} from './workspace-handover.js'

/**
 * La reprise de portefeuille — la forme sur le fil.
 *
 * Ce que ces tests tiennent, et pourquoi chacun existe :
 *
 *  - un comptage impossible voyage en `null`, jamais en `0` ;
 *  - la messagerie n'est JAMAIS une nature transférable (D58/D65) ;
 *  - ce qui est PERSONNEL est nommé, donc affichable, donc pas silencieux.
 */
describe('workspace-handover — la forme du transfert', () => {
  it('un comptage impossible voyage en `null` — jamais en « 0 »', () => {
    expect(portfolioHoldingSchema.parse({ kind: 'accounts', count: null })).toEqual({
      kind: 'accounts',
      count: null,
    })
    // …et un vrai zéro reste un zéro : c'est une mesure, pas une absence.
    expect(portfolioHoldingSchema.parse({ kind: 'accounts', count: 0 }).count).toBe(0)
  })

  it('refuse un comptage négatif — il ne voudrait rien dire', () => {
    expect(() => portfolioHoldingSchema.parse({ kind: 'accounts', count: -1 })).toThrow()
  })

  it('refuse une nature inconnue plutôt que de la laisser passer muette', () => {
    expect(() => portfolioHoldingSchema.parse({ kind: 'mailbox', count: 3 })).toThrow()
  })

  it('la messagerie et l’agenda ne sont PAS des natures transférables (D58, D65)', () => {
    for (const personal of PORTFOLIO_PERSONAL_KINDS) {
      expect(PORTFOLIO_HANDOVER_KINDS as readonly string[]).not.toContain(personal)
    }
  })

  it('ce qui reste personnel est NOMMÉ — la liste n’est pas vide', () => {
    expect(PORTFOLIO_PERSONAL_KINDS.length).toBeGreaterThan(0)
    expect(PORTFOLIO_PERSONAL_KINDS).toContain('mailbox')
  })

  it('la prévisualisation porte les natures, ce qui reste personnel, et les successeurs possibles', () => {
    const parsed = memberPortfolioSchema.parse({
      userId: '11111111-1111-4111-8111-111111111111',
      email: 'partant@esn.fr',
      fullName: 'Camille Partant',
      holdings: [
        { kind: 'accounts', count: 12 },
        { kind: 'contacts', count: null },
      ],
      personal: ['mailbox', 'calendar'],
      eligibleSuccessors: [
        {
          userId: '22222222-2222-4222-8222-222222222222',
          email: 'reprend@esn.fr',
          fullName: 'Alix Reprend',
          role: 'sales',
          joinedAt: '2026-03-02T09:00:00.000Z',
        },
      ],
    })
    expect(parsed.holdings[1]?.count).toBeNull()
    expect(parsed.personal).toContain('mailbox')
    expect(parsed.eligibleSuccessors).toHaveLength(1)
  })

  it('le corps du transfert n’accepte qu’un successeur, en uuid', () => {
    expect(handOverPortfolioSchema.parse({ toUserId: '22222222-2222-4222-8222-222222222222' }).toUserId).toBe(
      '22222222-2222-4222-8222-222222222222',
    )
    expect(() => handOverPortfolioSchema.parse({ toUserId: 'alix' })).toThrow()
  })

  it('le résultat dit ce qui a RÉELLEMENT changé de main, `null` compris', () => {
    const parsed = portfolioHandoverResultSchema.parse({
      fromUserId: '11111111-1111-4111-8111-111111111111',
      toUserId: '22222222-2222-4222-8222-222222222222',
      transferred: [
        { kind: 'accounts', count: 12 },
        { kind: 'missions', count: null },
      ],
    })
    expect(parsed.transferred.find(h => h.kind === 'missions')?.count).toBeNull()
  })

  // #4158.29 — la répartition par lots
  describe('handoverPlanSchema — répartir par lots, valider avant d’écrire', () => {
    const A = '22222222-2222-4222-8222-222222222222'
    const B = '33333333-3333-4333-8333-333333333333'
    const ID = '44444444-4444-4444-8444-444444444444'

    it('les actions ouvertes et les relances sont des natures transférables', () => {
      expect(PORTFOLIO_HANDOVER_KINDS).toContain('actions')
      expect(PORTFOLIO_HANDOVER_KINDS).toContain('followups')
    })

    it('un plan est un récapitulatif tant qu’il n’est pas confirmé', () => {
      const parsed = handoverPlanSchema.parse({ allocations: [{ toUserId: A, kind: 'accounts' }] })
      expect(parsed.confirm).toBe(false)
    })

    it('accepte plusieurs destinataires et une liste d’identifiants bornée', () => {
      const parsed = handoverPlanSchema.parse({
        allocations: [
          { toUserId: A, kind: 'accounts', ids: [ID] },
          { toUserId: B, kind: 'accounts' },
        ],
        confirm: true,
      })
      expect(parsed.allocations).toHaveLength(2)
    })

    it('refuse un plan vide, une nature inconnue, des identifiants vides', () => {
      expect(() => handoverPlanSchema.parse({ allocations: [] })).toThrow()
      expect(() => handoverPlanSchema.parse({ allocations: [{ toUserId: A, kind: 'mailbox' }] })).toThrow()
      expect(() => handoverPlanSchema.parse({ allocations: [{ toUserId: A, kind: 'accounts', ids: [] }] })).toThrow()
    })

    it('le résultat garde `null` ≠ 0 par ligne', () => {
      const parsed = handoverPlanResultSchema.parse({
        fromUserId: A,
        confirmed: false,
        lines: [
          { kind: 'accounts', toUserId: B, count: null },
          { kind: 'contacts', toUserId: B, count: 0 },
        ],
      })
      expect(parsed.lines[0]?.count).toBeNull()
      expect(parsed.lines[1]?.count).toBe(0)
    })
  })
})
