import { describe, expect, it } from 'vitest'
import {
  PROLONGED_ABSENCE_DAYS,
  RELATIONSHIP_SILENCE_DAYS,
  UNSECURED_CONSULTANT_DAYS,
  isProlongedAbsence,
  missionRiskSchema,
  missionRiskSeverity,
  missionRisks,
  type Mission,
} from './mission.js'
import {
  createMissionFeedbackSchema,
  isSatisfactionLow,
  missionSatisfactionOf,
  type MissionSatisfaction,
} from './mission-feedback.js'

/**
 * #2408.3, .16, .17, .20, .21 — les exceptions de la liste Missions
 * (contrat validé par Louis le 31/10/2026). Chaque test sait dire NON :
 * un silence (champ non lu) n'allume jamais une exception.
 */

const TODAY = new Date('2026-11-01T12:00:00Z')
const inDays = (days: number) => new Date(TODAY.getTime() + days * 86_400_000).toISOString().slice(0, 10)

function mission(over: Partial<Mission> = {}): Mission & { loadedDailyCostCents: number | null } {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    workspace_id: '22222222-2222-4222-8222-222222222222',
    account_id: '33333333-3333-4333-8333-333333333333',
    opportunity_id: null,
    label: 'TMA socle data',
    status: 'active',
    started_on: '2026-01-01',
    ends_on: inDays(200),
    daily_rate: 600,
    daily_cost: null,
    created_at: TODAY.toISOString(),
    updated_at: TODAY.toISOString(),
    loadedDailyCostCents: 400_00,
    ...over,
  }
}

const LOW: MissionSatisfaction = { client: 'low', consultant: null }
const FINE: MissionSatisfaction = { client: 'high', consultant: 'medium' }

describe('#2408.16 — satisfaction faible', () => {
  it('se lit sur le DERNIER niveau déclaré de chaque rail, jamais une moyenne', () => {
    const summary = missionSatisfactionOf([
      { rail: 'client', level: 'low', private: false, createdAt: '2026-10-01T00:00:00Z' },
      { rail: 'client', level: 'high', private: false, createdAt: '2026-10-20T00:00:00Z' },
      { rail: 'consultant', level: 'low', private: false, createdAt: '2026-10-05T00:00:00Z' },
    ])
    expect(summary).toEqual({ client: 'high', consultant: 'low' })
  })

  it('une entrée privée ou sans niveau ne compte pas — « non mesuré » reste null, jamais un niveau', () => {
    const summary = missionSatisfactionOf([
      { rail: 'client', level: 'low', private: true, createdAt: '2026-10-01T00:00:00Z' },
      { rail: 'client', level: null, private: false, createdAt: '2026-10-02T00:00:00Z' },
    ])
    expect(summary).toEqual({ client: null, consultant: null })
    expect(isSatisfactionLow(summary)).toBe(false)
  })

  it('allume `low_satisfaction` sur un rail bas, pas sur un niveau correct ni sur un silence', () => {
    expect(missionRisks({ ...mission(), satisfaction: LOW }, [], TODAY)).toContain('low_satisfaction')
    expect(missionRisks({ ...mission(), satisfaction: FINE }, [], TODAY)).not.toContain('low_satisfaction')
    expect(missionRisks(mission(), [], TODAY)).not.toContain('low_satisfaction')
  })

  it('le niveau est optionnel à la saisie : une note seule reste valide, niveau `null`', () => {
    expect(createMissionFeedbackSchema.parse({ rail: 'client', note: 'RAS' }).level).toBeNull()
    expect(createMissionFeedbackSchema.safeParse({ rail: 'client', note: 'RAS', level: 'bof' }).success).toBe(false)
  })
})

describe('#2408.3 — menace sur la relation', () => {
  it('= satisfaction client basse ET aucun contact depuis le seuil nommé', () => {
    const silent = new Date(TODAY.getTime() - (RELATIONSHIP_SILENCE_DAYS + 1) * 86_400_000).toISOString()
    expect(missionRisks({ ...mission(), satisfaction: LOW, lastAccountContactAt: silent }, [], TODAY)).toContain(
      'relationship_threatened',
    )
    // Aucun contact jamais, MESURÉ (`null`) : la relation est muette.
    expect(missionRisks({ ...mission(), satisfaction: LOW, lastAccountContactAt: null }, [], TODAY)).toContain(
      'relationship_threatened',
    )
  })

  it('dit NON : contact récent, satisfaction correcte, ou contact non lu', () => {
    const recent = new Date(TODAY.getTime() - 3 * 86_400_000).toISOString()
    const silent = new Date(TODAY.getTime() - (RELATIONSHIP_SILENCE_DAYS + 1) * 86_400_000).toISOString()
    expect(missionRisks({ ...mission(), satisfaction: LOW, lastAccountContactAt: recent }, [], TODAY)).not.toContain(
      'relationship_threatened',
    )
    expect(missionRisks({ ...mission(), satisfaction: FINE, lastAccountContactAt: silent }, [], TODAY)).not.toContain(
      'relationship_threatened',
    )
    expect(missionRisks({ ...mission(), satisfaction: LOW }, [], TODAY)).not.toContain('relationship_threatened')
  })
})

describe('#2408.17 — absence prolongée', () => {
  it('une absence en cours d’au moins le seuil nommé est prolongée ; plus courte ou passée, non', () => {
    const today = '2026-11-01'
    expect(isProlongedAbsence({ startsOn: '2026-10-25', endsOn: '2026-11-10' }, today)).toBe(true)
    expect(
      isProlongedAbsence(
        { startsOn: '2026-11-01', endsOn: `2026-11-${String(PROLONGED_ABSENCE_DAYS - 1).padStart(2, '0')}` },
        today,
      ),
    ).toBe(false)
    expect(isProlongedAbsence({ startsOn: '2026-09-01', endsOn: '2026-10-15' }, today)).toBe(false)
  })

  it('allume `prolonged_absence` sur un `true` mesuré, jamais sur un silence', () => {
    expect(missionRisks({ ...mission(), assigneeOnProlongedAbsence: true }, [], TODAY)).toContain('prolonged_absence')
    expect(missionRisks({ ...mission(), assigneeOnProlongedAbsence: false }, [], TODAY)).not.toContain(
      'prolonged_absence',
    )
    expect(missionRisks(mission(), [], TODAY)).not.toContain('prolonged_absence')
  })
})

describe('#2408.20 — consultant non sécurisé', () => {
  it('= fin sous le seuil nommé, sans renouvellement ni placement', () => {
    expect(
      missionRisks(
        { ...mission({ ends_on: inDays(UNSECURED_CONSULTANT_DAYS) }), assigneeWithoutNextPlacement: true },
        [],
        TODAY,
      ),
    ).toContain('consultant_unsecured')
  })

  it('dit NON : renouvelée, placée, fin lointaine, ou placement non lu', () => {
    const soon = inDays(10)
    expect(
      missionRisks(
        { ...mission({ ends_on: soon }), renewal_status: 'renouvele', assigneeWithoutNextPlacement: true },
        [],
        TODAY,
      ),
    ).not.toContain('consultant_unsecured')
    expect(
      missionRisks({ ...mission({ ends_on: soon }), assigneeWithoutNextPlacement: false }, [], TODAY),
    ).not.toContain('consultant_unsecured')
    expect(
      missionRisks(
        { ...mission({ ends_on: inDays(UNSECURED_CONSULTANT_DAYS + 1) }), assigneeWithoutNextPlacement: true },
        [],
        TODAY,
      ),
    ).not.toContain('consultant_unsecured')
    expect(missionRisks(mission({ ends_on: soon }), [], TODAY)).not.toContain('consultant_unsecured')
  })
})

describe('#2408.21 — action sans owner', () => {
  it('allume `action_without_owner` sur un `true` mesuré, jamais sur un silence', () => {
    expect(missionRisks({ ...mission(), ownerlessOpenAction: true }, [], TODAY)).toContain('action_without_owner')
    expect(missionRisks({ ...mission(), ownerlessOpenAction: false }, [], TODAY)).not.toContain('action_without_owner')
    expect(missionRisks(mission(), [], TODAY)).not.toContain('action_without_owner')
  })
})

describe('GA-08 — les cinq exceptions s’ajoutent EN FIN d’énumération', () => {
  it('l’ordre existant ne bouge pas', () => {
    expect(missionRiskSchema.options.slice(-5)).toEqual([
      'low_satisfaction',
      'relationship_threatened',
      'prolonged_absence',
      'consultant_unsecured',
      'action_without_owner',
    ])
    expect(missionRiskSchema.options.indexOf('invoice_blocked')).toBe(missionRiskSchema.options.length - 6)
  })

  it('chaque exception a une sévérité, jamais une probabilité', () => {
    expect(missionRiskSeverity(['relationship_threatened'])).toBe('at_risk')
    expect(missionRiskSeverity(['consultant_unsecured'])).toBe('at_risk')
    expect(missionRiskSeverity(['low_satisfaction'])).toBe('at_risk')
    expect(missionRiskSeverity(['prolonged_absence'])).toBe('watch')
    expect(missionRiskSeverity(['action_without_owner'])).toBe('watch')
  })
})
