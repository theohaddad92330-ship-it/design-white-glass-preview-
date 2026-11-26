import { describe, expect, it } from 'vitest'
import { buildNeedVerdict } from '@bellum/contracts'
import { needVerdictAxisDisplay, needVerdictAxisTone, needVerdictTone } from './need-verdict-display'

/**
 * Ce que ces tests tiennent : qu'un axe NON RENSEIGNÉ ne se présente jamais
 * comme une valeur. C'est le seul endroit où « 0 profil » pourrait naître d'une
 * absence, et il naîtrait d'un `?? 0` de deux caractères.
 */
function verdictWith(over: Partial<Parameters<typeof buildNeedVerdict>[0]> = {}) {
  return buildNeedVerdict({
    staffingCapacity: { aboveThreshold: 3, threshold: 60, evaluated: 12 },
    economics: { targetRateCents: 65_000, floorRateCents: 60_000 },
    relationship: { activeMissions: 2, accountKnown: true },
    competition: { competitorsOnAccount: 8, panelLooked: true },
    feasibility: { availabilityScore: 100, startOn: '2026-10-01' },
    access: { contactsKnown: 4, decisionMakerKnown: true },
    procurement: { procurementInvolvement: 'non_implique' },
    contractRisk: { riskText: null },
    ...over,
  })
}

describe('needVerdictAxisDisplay', () => {
  it('un axe mesuré rend une clé de VALEUR et ses nombres', () => {
    const [staffing] = verdictWith().axes
    const display = needVerdictAxisDisplay(staffing)
    expect(display).toEqual({
      measured: true,
      key: 'needVerdict.axisValue.staffing_capacity',
      params: { count: 3, threshold: 60 },
    })
  })

  it('⚠️ un axe NON renseigné rend la clé de son ABSENCE — jamais une valeur', () => {
    const verdict = verdictWith({ competition: { competitorsOnAccount: null, panelLooked: false } })
    const competition = verdict.axes.find(axis => axis.axis === 'competition')
    const display = needVerdictAxisDisplay(competition as never)
    expect(display).toEqual({ measured: false, key: 'needVerdict.unmeasured.panelNeverLooked' })
    // Et surtout : rien qui ressemble à un zéro n'a été fabriqué.
    expect('params' in display).toBe(false)
  })

  it('chacune des huit absences possibles porte une clé DISTINCTE', () => {
    const verdict = buildNeedVerdict({
      staffingCapacity: { aboveThreshold: null, threshold: 60, evaluated: null },
      economics: { targetRateCents: null, floorRateCents: null },
      relationship: { activeMissions: null, accountKnown: false },
      competition: { competitorsOnAccount: null, panelLooked: false },
      feasibility: { availabilityScore: null, startOn: null },
      access: { contactsKnown: null, decisionMakerKnown: false },
      procurement: { procurementInvolvement: null },
      contractRisk: { riskText: null },
    })
    const keys = verdict.axes.map(axis => needVerdictAxisDisplay(axis).key)
    expect(new Set(keys).size).toBe(8)
    expect(keys.every(key => key.startsWith('needVerdict.unmeasured.'))).toBe(true)
  })
})

describe('les tonalités', () => {
  it('positif / attention / bloquant, et l’absence qui n’est aucune des trois', () => {
    const verdict = verdictWith({
      competition: { competitorsOnAccount: 8, panelLooked: true },
      economics: { targetRateCents: 50_000, floorRateCents: 60_000 },
      access: { contactsKnown: null, decisionMakerKnown: false },
      procurement: { procurementInvolvement: null },
      contractRisk: { riskText: null },
    })
    const tones = Object.fromEntries(verdict.axes.map(axis => [axis.axis, needVerdictAxisTone(axis)]))
    expect(tones.staffing_capacity).toBe('success')
    expect(tones.competition).toBe('warning')
    expect(tones.economics).toBe('danger')
    expect(tones.access).toBe('unknown')
  })

  it('⚠️ « je manque de données » se lit en NEUTRE, jamais en refus', () => {
    // Lui donner la couleur du non ferait abandonner un besoin que personne
    // n'a encore regardé.
    expect(needVerdictTone('insufficient_data')).toBe('unknown')
    expect(needVerdictTone('go')).toBe('success')
    expect(needVerdictTone('no_go')).toBe('danger')
  })
})

describe('#3389.9/.10 — cadre d’achat et risque contractuel', () => {
  it('les achats et le risque se disent par une clé propre, sans nombre', () => {
    const verdict = verdictWith({
      procurement: { procurementInvolvement: 'implique' },
      contractRisk: { riskText: 'Pénalités' },
    })
    const byAxis = Object.fromEntries(verdict.axes.map(axis => [axis.axis, needVerdictAxisDisplay(axis)]))
    expect(byAxis.procurement).toEqual({ measured: true, key: 'needVerdict.axisValue.procurementInvolved' })
    expect(byAxis.contract_risk).toEqual({ measured: true, key: 'needVerdict.axisValue.contract_risk' })
    expect(
      needVerdictAxisDisplay(verdictWith({ procurement: { procurementInvolvement: 'non_implique' } }).axes[6]!).key,
    ).toBe('needVerdict.axisValue.procurementNotInvolved')
  })
})
