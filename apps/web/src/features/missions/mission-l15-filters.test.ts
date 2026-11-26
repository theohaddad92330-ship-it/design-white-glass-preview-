import { describe, expect, it } from 'vitest'
import type { MissionView } from './api'
import {
  MISSION_PRESET_VIEWS,
  exceptionUrgencyRank,
  legalEntityCounts,
  matchesPresetView,
  matchesSatisfaction,
  presetViewsFor,
  satisfactionCounts,
} from './filters'

/**
 * L15 (contrat Louis 31/10/2026) — filtres satisfaction (#2408.51) et société
 * juridique (#2408.40), vues prêtes (#2408.54, .56, .57, .58, .59).
 * Chaque prédicat sait dire NON, et un silence n'entre dans aucune population.
 */
const mission = (over: Partial<MissionView> = {}): MissionView =>
  ({
    id: 'm-1',
    label: 'TMA ACME',
    status: 'active',
    ends_on: '2027-06-30',
    accountName: 'ACME',
    marginPercent: null,
    renewal: 'far',
    risks: [],
    ...over,
  }) as MissionView

describe('#2408.51 — filtre satisfaction', () => {
  it('un niveau retient la mission dès qu’UN rail le porte', () => {
    const m = mission({ satisfaction: { client: 'low', consultant: 'high' } })
    expect(matchesSatisfaction(m, ['low'])).toBe(true)
    expect(matchesSatisfaction(m, ['high'])).toBe(true)
    expect(matchesSatisfaction(m, ['medium'])).toBe(false)
  })

  it('« non mesurée » = aucun rail déclaré ; une clé absente (non lue) n’y entre pas', () => {
    expect(matchesSatisfaction(mission({ satisfaction: { client: null, consultant: null } }), ['unmeasured'])).toBe(
      true,
    )
    expect(matchesSatisfaction(mission(), ['unmeasured'])).toBe(false)
    expect(matchesSatisfaction(mission({ satisfaction: { client: 'low', consultant: null } }), ['unmeasured'])).toBe(
      false,
    )
  })

  it('compte chaque population, la recherche appliquée', () => {
    const counts = satisfactionCounts(
      [
        mission({ id: 'a', satisfaction: { client: 'low', consultant: null } }),
        mission({ id: 'b', satisfaction: { client: null, consultant: null } }),
        mission({ id: 'c', label: 'Autre', satisfaction: { client: 'low', consultant: 'low' } }),
      ],
      'TMA',
    )
    expect(counts.get('low')).toBe(1)
    expect(counts.get('unmeasured')).toBe(1)
    expect(counts.has('high')).toBe(false)
  })
})

describe('#2408.40 — filtre société juridique', () => {
  it('compte les sociétés CONNUES seulement — jamais un libellé inventé pour l’absence', () => {
    const counts = legalEntityCounts(
      [
        mission({ id: 'a', legalEntityName: 'Bellum Conseil SAS' }),
        mission({ id: 'b', legalEntityName: 'Bellum Conseil SAS' }),
        mission({ id: 'c', legalEntityName: null }),
      ],
      '',
    )
    expect([...counts.entries()]).toEqual([['Bellum Conseil SAS', 2]])
  })
})

describe('#2408.54/.56/.57/.58/.59 — vues prêtes', () => {
  it('nomme les cinq vues demandées', () => {
    expect(MISSION_PRESET_VIEWS).toEqual([
      'thisWeek',
      'timesheetsMissing',
      'invoicesBlocked',
      'paymentsLate',
      'marginUnmeasured',
    ])
  })

  it('CRA manquants = `timesheet_missing`, pas un relevé contesté', () => {
    expect(matchesPresetView(mission({ risks: ['timesheet_missing'] }), 'timesheetsMissing')).toBe(true)
    expect(matchesPresetView(mission({ risks: ['timesheet_disputed'] }), 'timesheetsMissing')).toBe(false)
  })

  it('Factures bloquées / Paiements en retard / Marge non mesurée lisent le risque ou le badge déjà calculés', () => {
    expect(matchesPresetView(mission({ risks: ['invoice_blocked'] }), 'invoicesBlocked')).toBe(true)
    expect(matchesPresetView(mission({ billingAlert: 'payment_late' }), 'paymentsLate')).toBe(true)
    expect(matchesPresetView(mission({ billingAlert: 'invoice_overdue' }), 'paymentsLate')).toBe(true)
    expect(matchesPresetView(mission({ billingAlert: 'invoice_blocked' }), 'paymentsLate')).toBe(false)
    expect(matchesPresetView(mission({ risks: ['margin_unknown'] }), 'marginUnmeasured')).toBe(true)
    expect(matchesPresetView(mission({ risks: ['margin_at_risk'] }), 'marginUnmeasured')).toBe(false)
  })

  it('À traiter cette semaine = échéance imminente/dépassée ou exception critique ; une mission saine n’y est pas', () => {
    expect(matchesPresetView(mission({ renewal: 'imminent' }), 'thisWeek')).toBe(true)
    expect(matchesPresetView(mission({ risks: ['timesheet_disputed'] }), 'thisWeek')).toBe(true)
    expect(matchesPresetView(mission({ risks: ['no_end_date'], renewal: 'unknown' }), 'thisWeek')).toBe(false)
    expect(matchesPresetView(mission(), 'thisWeek')).toBe(false)
  })

  it('droits : sans finance:read, aucune vue financière n’est proposée', () => {
    expect(presetViewsFor(false)).toEqual(['thisWeek', 'timesheetsMissing'])
    expect(presetViewsFor(undefined)).toEqual(['thisWeek', 'timesheetsMissing'])
    expect(presetViewsFor(true)).toEqual(MISSION_PRESET_VIEWS)
  })
})

describe('#2408 — tri par urgence des exceptions', () => {
  it('une exception avérée passe devant une exception à risque, qui passe devant une mission saine', () => {
    const critical = exceptionUrgencyRank(mission({ risks: ['timesheet_disputed'] }))
    const atRisk = exceptionUrgencyRank(mission({ risks: ['relationship_threatened'] }))
    const healthy = exceptionUrgencyRank(mission({ risks: [] }))
    expect(critical).toBeLessThan(atRisk)
    expect(atRisk).toBeLessThan(healthy)
  })
})
