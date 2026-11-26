import { describe, expect, it } from 'vitest'
import { TIMESHEET_STATUSES } from './mission.js'
import { canMarkTimesheetNotApplicable, markTimesheetNotApplicableSchema } from './timesheet-exception.js'

/**
 * #2196.31 — « Marquer non applicable » un relevé (décision Louis 19/09/2026) :
 * une EXCEPTION TRACÉE, motif obligatoire, qui prime sur la déduction du contrat
 * pour CE mois seulement.
 */
describe('canMarkTimesheetNotApplicable (#2196.31)', () => {
  it('ne vise que ce que la DÉDUCTION produit — attendu, manquant, escaladé', () => {
    const allowed = TIMESHEET_STATUSES.filter(canMarkTimesheetNotApplicable)
    expect(allowed).toEqual(['expected', 'missing', 'escalated'])
  })

  it('refuse un relevé DÉPOSÉ — un fait ne s’efface pas derrière une exception', () => {
    for (const status of ['draft', 'submitted', 'validated', 'disputed', 'rejected'] as const) {
      expect(canMarkTimesheetNotApplicable(status)).toBe(false)
    }
  })

  it('refuse un mois déjà non requis — il n’y a rien à excepter', () => {
    expect(canMarkTimesheetNotApplicable('not_required')).toBe(false)
  })
})

describe('markTimesheetNotApplicableSchema (#2196.31)', () => {
  const base = {
    missionId: '8c1f5b3e-2a4d-4f6e-9b7a-1d2c3e4f5a6b',
    month: '2026-08',
    consultantId: null,
  }

  it('exige un MOTIF — trois espaces ne disent rien à personne', () => {
    expect(markTimesheetNotApplicableSchema.safeParse({ ...base, reason: '   ' }).success).toBe(false)
    expect(markTimesheetNotApplicableSchema.safeParse({ ...base }).success).toBe(false)
    expect(markTimesheetNotApplicableSchema.safeParse({ ...base, reason: 'Congé sans solde' }).success).toBe(true)
  })

  it('vise UN mois — `AAAA-MM`, jamais une période ouverte', () => {
    expect(markTimesheetNotApplicableSchema.safeParse({ ...base, month: '2026-8', reason: 'x' }).success).toBe(false)
  })

  it('est strict : rien d’autre que la maille et le motif n’entre', () => {
    expect(markTimesheetNotApplicableSchema.safeParse({ ...base, reason: 'x', createdBy: 'quelqu’un' }).success).toBe(
      false,
    )
  })
})
