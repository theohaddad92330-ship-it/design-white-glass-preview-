import { carriedLoadedDailyCostCents, plannedMarginCents } from '@bellum/contracts'
import { DEMO_CRM_BACKBONE } from './demo-crm-backbone'

// #4192 (épopée #4191, lot L1) — la salle montre la marge prévue d'un positionnement, et son absence nommée.
describe('DEMO_CRM_BACKBONE — trois positionnements Société Générale complétés', () => {
  const { account, submissions } = DEMO_CRM_BACKBONE

  it('est posé chez Société Générale, avec trois positionnements sur des talents distincts', () => {
    expect(account).toBe('Société Générale')
    expect(submissions).toHaveLength(3)
    expect(new Set(submissions.map(s => s.consultant)).size).toBe(3)
  })

  it('le positionnement retenu : TJM 650 € · 120 j → marge prévue 24 000 €', () => {
    const retained = submissions.find(s => s.stage === 'accepted')
    expect(retained).toBeDefined()
    expect(retained?.proposed_rate_cents).toBe(650_00)
    expect(retained?.planned_days).toBe(120)
    expect(
      plannedMarginCents({
        proposedRateCents: retained?.proposed_rate_cents ?? null,
        dailyCostCents: retained?.daily_cost_cents ?? null,
        plannedDays: retained?.planned_days ?? null,
      }),
    ).toBe(24_000_00)
  })

  it('un positionnement a une marge complète, un autre n’a PAS de coût : « marge non mesurée », jamais 0', () => {
    const margins = submissions.map(s =>
      plannedMarginCents({
        proposedRateCents: s.proposed_rate_cents,
        dailyCostCents: s.daily_cost_cents,
        plannedDays: s.planned_days,
      }),
    )
    expect(margins.filter(m => m !== null).length).toBeGreaterThanOrEqual(2)
    const unmeasured = submissions.filter(s => s.daily_cost_cents === null)
    expect(unmeasured).toHaveLength(1)
    expect(unmeasured[0]?.proposed_rate_cents).not.toBeNull()
    expect(unmeasured[0]?.planned_days).not.toBeNull()
  })
})

// #4191 G4 — la salle montre une mission SIGNÉE depuis le positionnement retenu, qui porte son coût.
describe('DEMO_CRM_BACKBONE — la mission signée reprend le coût du positionnement retenu', () => {
  const { submissions, signedMission } = DEMO_CRM_BACKBONE
  const retained = submissions.find(s => s.stage === 'accepted')

  it('est rattachée au positionnement RETENU, jamais à un autre', () => {
    expect(signedMission.consultant).toBe(retained?.consultant)
  })

  it('porte le coût du positionnement : TJM 650 € − coût 450 € → marge mesurée (jamais 0, jamais devinée)', () => {
    const cost = carriedLoadedDailyCostCents(retained?.daily_cost_cents, null)
    expect(cost).toBe(450_00)
    expect(signedMission.daily_rate).toBe(650)
    expect(signedMission.daily_rate * 100 - (cost ?? 0)).toBeGreaterThan(0)
  })
})
