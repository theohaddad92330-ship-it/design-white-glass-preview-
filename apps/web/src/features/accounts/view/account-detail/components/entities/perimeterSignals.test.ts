import { describe, expect, it } from 'vitest'
import { matchPerimeterSignal, readPriorityPerimeters } from './perimeterSignals'

const RAW_ANALYSIS = {
  priority_perimeters: [
    {
      name: 'France Télévisions',
      tier: 'P1',
      perimeterScore: 16,
      scoreBreakdown: [
        { axis: 'operationnelle', label: 'Entité opérationnelle identifiable', points: 4, max: 4 },
        { axis: 'accessibilite', label: 'Accessibilité (14 jours)', points: 4, max: 4 },
      ],
      whatToSell: ['Migration cloud', 'Refonte data'],
      entryRole: 'opérationnel / prescripteur (bottom-up)',
      confidence: 'high',
      why: '16/20 · entité IT · accessible · angle identifié',
    },
    {
      name: 'DSI Groupe',
      tier: 'secondaire',
      perimeterScore: 6,
      scoreBreakdown: [{ axis: 'accessibilite', label: 'Accessibilité (14 jours)', points: 0, max: 4 }],
      whatToSell: [],
      entryRole: 'sponsor C-level (top-down)',
      confidence: 'low',
      why: '6/20',
    },
  ],
}

describe('readPriorityPerimeters — #2966 (#2119.43-51)', () => {
  it('lit les périmètres déjà calculés par `perimeter_score.py`, typés', () => {
    const perimeters = readPriorityPerimeters(RAW_ANALYSIS)
    expect(perimeters).toHaveLength(2)
    expect(perimeters[0]).toEqual({
      name: 'France Télévisions',
      tier: 'P1',
      confidence: 'high',
      entryRole: 'opérationnel / prescripteur (bottom-up)',
      accessibility: 'high',
      signalsCount: 2,
    })
    expect(perimeters[1].accessibility).toBe('low')
    expect(perimeters[1].signalsCount).toBe(0)
  })

  it('rend [] sur une analyse antérieure à ce champ — jamais une erreur', () => {
    expect(readPriorityPerimeters({})).toEqual([])
    expect(readPriorityPerimeters(null)).toEqual([])
    expect(readPriorityPerimeters(undefined)).toEqual([])
    expect(readPriorityPerimeters('not an object')).toEqual([])
  })

  it('ignore une entrée sans nom, sans faire échouer les autres', () => {
    const perimeters = readPriorityPerimeters({ priority_perimeters: [{ tier: 'P1' }, { name: 'DSI Groupe' }] })
    expect(perimeters.map(p => p.name)).toEqual(['DSI Groupe'])
  })
})

describe('matchPerimeterSignal — rapprochement textuel, jamais deviné', () => {
  const perimeters = readPriorityPerimeters(RAW_ANALYSIS)

  it('retrouve un nom d’entité plus long que le nom du périmètre', () => {
    const match = matchPerimeterSignal('France Télévisions (holding/société mère)', perimeters)
    expect(match?.name).toBe('France Télévisions')
  })

  it('retrouve malgré la casse et les accents', () => {
    expect(matchPerimeterSignal('france televisions', perimeters)?.name).toBe('France Télévisions')
  })

  it('rend null — non mesuré — quand aucun périmètre prioritaire ne correspond', () => {
    expect(matchPerimeterSignal('Filiale sans rapport', perimeters)).toBeNull()
  })
})
