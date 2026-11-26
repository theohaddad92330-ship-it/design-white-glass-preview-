import { describe, expect, it } from 'vitest'
import { accountManagerReviewSchema } from './account-manager-review.js'

/**
 * #2319.112-.116 (section G, épopée #2985) — deux sous-points réalisables sans
 * inventer de donnée : « actions réalisées » et « actions non avancées »,
 * plus le tiroir « ce qui a changé » et les risques déjà saisis, réutilisés.
 */
describe('accountManagerReviewSchema', () => {
  const base = {
    accountId: '11111111-1111-1111-1111-111111111111',
    accountName: 'Société Générale',
    generatedAt: '2026-09-26T08:00:00.000Z',
    changeDigest: null,
    actionsCompleted: [],
    actionsStalled: [],
    risks: [],
    verdict: { status: 'not_evaluable', reasons: [], notEvaluated: ['coverage', 'plan', 'change_digest', 'signals'] },
    coverage: null,
    importantFacts: [],
    decisionsRequested: [],
    arbitrationsRequested: [],
  }

  it('accepte une revue sans aucune version antérieure à comparer', () => {
    const parsed = accountManagerReviewSchema.safeParse(base)
    expect(parsed.success).toBe(true)
  })

  it('accepte une action réalisée sans cible ni responsable nommés', () => {
    const parsed = accountManagerReviewSchema.safeParse({
      ...base,
      actionsCompleted: [
        {
          id: '22222222-2222-2222-2222-222222222222',
          label: 'Relancer après le comité',
          targetLabel: null,
          ownerName: null,
          completedAt: null,
        },
      ],
    })
    expect(parsed.success).toBe(true)
  })

  it('refuse une action non avancée SANS échéance — c’est l’échéance dépassée qui la rend "non avancée"', () => {
    const parsed = accountManagerReviewSchema.safeParse({
      ...base,
      actionsStalled: [
        {
          id: '33333333-3333-3333-3333-333333333333',
          label: 'Envoyer la proposition',
          targetLabel: null,
          ownerName: null,
        },
      ],
    })
    expect(parsed.success).toBe(false)
  })

  it('accepte un risque tel qu’écrit sur une affaire du compte', () => {
    const parsed = accountManagerReviewSchema.safeParse({
      ...base,
      risks: [
        {
          projectId: '44444444-4444-4444-4444-444444444444',
          projectLabel: 'Migration ERP',
          risks: 'Le sponsor part en congés trois semaines avant le go-live.',
        },
      ],
    })
    expect(parsed.success).toBe(true)
  })

  describe('#2985 — verdict, couverture, faits importants, décisions demandées', () => {
    it('refuse un verdict qui porte un pourcentage ou une probabilité (doctrine : jamais de chance de closing)', () => {
      const bad = accountManagerReviewSchema.safeParse({
        ...base,
        verdict: { status: 'attention', reasons: [], notEvaluated: [], probability: 0.4 },
      })
      expect(bad.success).toBe(false)
    })

    it('refuse un statut de verdict hors du vocabulaire fermé', () => {
      const bad = accountManagerReviewSchema.safeParse({
        ...base,
        verdict: { status: 'won_80_percent', reasons: [], notEvaluated: [] },
      })
      expect(bad.success).toBe(false)
    })

    it('accepte un verdict « attention » dont chaque raison est un compte nommé', () => {
      const ok = accountManagerReviewSchema.safeParse({
        ...base,
        verdict: { status: 'attention', reasons: [{ kind: 'stalled_actions', count: 2 }], notEvaluated: ['coverage'] },
      })
      expect(ok.success).toBe(true)
    })

    it('refuse une raison à zéro occurrence : une absence ne fait aucune ligne', () => {
      const bad = accountManagerReviewSchema.safeParse({
        ...base,
        verdict: { status: 'attention', reasons: [{ kind: 'risks', count: 0 }], notEvaluated: [] },
      })
      expect(bad.success).toBe(false)
    })

    it('accepte une couverture avec ses manques nommés, et `null` quand elle n’a pas pu être lue', () => {
      const ok = accountManagerReviewSchema.safeParse({
        ...base,
        coverage: { gapCount: 3, gaps: [{ label: 'Direction financière', reason: 'Aucun contact connu' }] },
      })
      expect(ok.success).toBe(true)
    })

    it('accepte un fait important daté ou non, et une décision demandée sans responsable', () => {
      const ok = accountManagerReviewSchema.safeParse({
        ...base,
        importantFacts: [{ label: 'Appel d’offres cloud annoncé', date: null }],
        decisionsRequested: [
          {
            id: '55555555-5555-5555-5555-555555555555',
            label: 'Valider la relance',
            targetLabel: null,
            ownerName: null,
          },
        ],
      })
      expect(ok.success).toBe(true)
    })
  })

  // #2319 (arbitrage owner/ressource, lot X60) — une ligne ne naît que d'un conflit RÉEL.
  const arbitration = {
    projectId: '44444444-4444-4444-4444-444444444444',
    projectLabel: 'Refonte portail',
    needTitle: 'Ingénieur infrastructure',
    consultantId: '55555555-5555-5555-5555-555555555555',
    consultantName: 'Karim B.',
    accountOwnerName: 'Louis',
    resourceOwnerName: 'Marie',
  }

  it('accepte un arbitrage dont les deux porteurs sont nommés', () => {
    expect(accountManagerReviewSchema.safeParse({ ...base, arbitrationsRequested: [arbitration] }).success).toBe(true)
  })

  it('refuse un arbitrage sans le porteur de l’affaire : un conflit se lit entre DEUX porteurs connus', () => {
    const parsed = accountManagerReviewSchema.safeParse({
      ...base,
      arbitrationsRequested: [{ ...arbitration, accountOwnerName: null }],
    })
    expect(parsed.success).toBe(false)
  })

  it('compte les arbitrages en attente comme une raison du verdict, jamais à zéro', () => {
    const verdict = (count: number) =>
      accountManagerReviewSchema.safeParse({
        ...base,
        verdict: { status: 'attention', reasons: [{ kind: 'arbitrations_pending', count }], notEvaluated: [] },
      }).success
    expect(verdict(1)).toBe(true)
    expect(verdict(0)).toBe(false)
  })
})
