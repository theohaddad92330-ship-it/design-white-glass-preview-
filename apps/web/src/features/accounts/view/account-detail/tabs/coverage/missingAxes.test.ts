import type { CoverageGapsResponse } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { buildMissingAxes, MISSING_AXES } from './missingAxes'

/**
 * #2121.48 — « Qui nous manque pour avancer ? » nomme DIX axes, et chacun dit
 * s'il est tenu, s'il manque, ou s'il n'a pas pu être mesuré. Un axe que le
 * payload ne porte pas n'est jamais « tenu » ni « manquant » : il est NOMMÉ
 * non mesuré (« non mesuré n'est jamais 0 »).
 */
function payload(over: Partial<CoverageGapsResponse> = {}): CoverageGapsResponse {
  return {
    account_id: 'acc-1',
    score: 0.5,
    contacts_total: 4,
    classified_contacts: 3,
    target_contacts: 12,
    families: [],
    families_covered: 1,
    families_target: 3,
    levels: [
      { level: 'c_level', label: 'C-Level', covered: false, contact_count: 0 },
      { level: 'n1', label: 'N-1', covered: true, contact_count: 1 },
      { level: 'n2', label: 'N-2', covered: true, contact_count: 2 },
    ],
    levels_covered: 2,
    levels_target: 3,
    champion_count: 1,
    single_champion_risk: true,
    gaps: [],
    ...over,
  }
}

const stateOf = (axes: ReturnType<typeof buildMissingAxes>, key: string) => axes.find(axis => axis.key === key)?.state

describe('buildMissingAxes (#2121.48)', () => {
  it('nomme les dix axes, dans l’ordre, une fois chacun', () => {
    const axes = buildMissingAxes(payload())
    expect(axes.map(axis => axis.key)).toEqual([...MISSING_AXES])
    expect(axes).toHaveLength(10)
  })

  it('lit ce qui manque dans le payload — niveaux, familles, rôles, mono-contact', () => {
    const axes = buildMissingAxes(
      payload({ roles_target: 8, roles_covered: 6, roles_missing: ['sponsor', 'procurement'] }),
    )
    expect(stateOf(axes, 'levels')).toBe('missing')
    expect(stateOf(axes, 'families')).toBe('missing')
    expect(stateOf(axes, 'sponsor')).toBe('missing')
    expect(stateOf(axes, 'procurement')).toBe('missing')
    expect(stateOf(axes, 'economicBuyer')).toBe('covered')
    expect(stateOf(axes, 'technicalReferent')).toBe('covered')
    expect(stateOf(axes, 'operationalRelay')).toBe('covered')
    expect(stateOf(axes, 'singleContact')).toBe('missing')
  })

  it('un axe que le payload ne porte pas est NON MESURÉ — jamais tenu, jamais manquant', () => {
    const axes = buildMissingAxes(payload({ levels: [] }))
    // Pas de rôles émis, pas d'entités, pas de niveau N-2 : on ne sait pas.
    for (const key of [
      'sponsor',
      'economicBuyer',
      'technicalReferent',
      'procurement',
      'entities',
      'operationalRelay',
    ]) {
      expect(stateOf(axes, key)).toBe('unmeasured')
    }
    // La prochaine action vit dans le plan d'action, pas dans la couverture.
    expect(stateOf(axes, 'nextAction')).toBe('unmeasured')
  })

  it('tout tenu se lit tenu — la garde sait aussi dire OUI', () => {
    const axes = buildMissingAxes(
      payload({
        families_covered: 3,
        levels_covered: 3,
        single_champion_risk: false,
        roles_target: 8,
        roles_covered: 8,
        roles_missing: [],
        entities_total: 2,
        entities_covered: 2,
        entities_uncovered_names: [],
      }),
    )
    for (const axis of axes.filter(a => a.key !== 'nextAction')) expect(axis.state).toBe('covered')
  })
})
