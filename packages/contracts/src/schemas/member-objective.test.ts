import { describe, expect, it } from 'vitest'
import {
  COMMERCIAL_OBJECTIVE_AXES,
  commercialObjectiveSchema,
  memberObjectiveSchema,
  myCommercialObjectivesResponseSchema,
  objectiveDataCoverageSchema,
  upsertMemberObjectiveSchema,
} from './member-objective.js'

describe('member-objective — les sept objectifs commerciaux (lot FA, #2114.16-.27)', () => {
  it('nomme les sept axes, dans l’ordre de la demande #2114.16-.22', () => {
    expect(COMMERCIAL_OBJECTIVE_AXES).toEqual([
      'meetings',
      'qualified_needs',
      'placements',
      'revenue',
      'margin',
      'new_accounts',
      'consultants_on_mission',
    ])
  })

  it('memberObjectiveSchema accepte les quatre nouvelles cibles nullables', () => {
    const parsed = memberObjectiveSchema.parse({
      id: 'obj-1',
      user_id: 'u1',
      period_month: '2026-09-01',
      target_meetings: 8,
      target_accounts: null,
      target_revenue: 50000,
      target_qualified_needs: 5,
      target_placements: null,
      target_margin_percent: 22.5,
      target_consultants_on_mission: null,
      created_at: '2026-09-01T00:00:00.000Z',
    })
    expect(parsed.target_qualified_needs).toBe(5)
    expect(parsed.target_margin_percent).toBe(22.5)
  })

  it('upsertMemberObjectiveSchema refuse un objectif de marge à 0 % (ce n’est pas un objectif)', () => {
    expect(upsertMemberObjectiveSchema.safeParse({ target_margin_percent: 0 }).success).toBe(false)
    expect(upsertMemberObjectiveSchema.safeParse({ target_margin_percent: 25 }).success).toBe(true)
    expect(upsertMemberObjectiveSchema.safeParse({ target_margin_percent: null }).success).toBe(true)
  })

  it('objectiveDataCoverageSchema porte measured/total, jamais un pourcentage caché', () => {
    const coverage = objectiveDataCoverageSchema.parse({ measured: 3, total: 5 })
    expect(coverage).toEqual({ measured: 3, total: 5 })
  })

  it('commercialObjectiveSchema : achieved est une vraie valeur, target peut être non fixée', () => {
    const parsed = commercialObjectiveSchema.parse({
      axis: 'margin',
      target: null,
      achieved: 0,
      period_month: '2026-09-01',
      coverage: { measured: 0, total: 0 },
    })
    expect(parsed.target).toBeNull()
    expect(parsed.achieved).toBe(0)
  })

  it('myCommercialObjectivesResponseSchema porte le mois et le tableau des sept axes', () => {
    const objectives = COMMERCIAL_OBJECTIVE_AXES.map(axis => ({
      axis,
      target: null,
      achieved: 0,
      period_month: '2026-09-01',
      coverage: { measured: 0, total: 0 },
    }))
    const parsed = myCommercialObjectivesResponseSchema.parse({ period_month: '2026-09-01', objectives })
    expect(parsed.objectives).toHaveLength(7)
  })
})
