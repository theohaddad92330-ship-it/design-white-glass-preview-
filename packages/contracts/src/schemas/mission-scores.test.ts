import { describe, expect, it } from 'vitest'
import { computeCapacity, scoreFromAxes } from './mission-scores.js'

describe('scoreFromAxes', () => {
  it('ne rend AUCUN score sous trois axes évaluables', () => {
    // Un score sur un seul axe n'est pas un score : c'est cet axe déguisé, et
    // il se présente avec l'autorité d'une synthèse.
    const result = scoreFromAxes([
      { axis: 'renewal', value: 80 },
      { axis: 'margin', value: 40 },
      { axis: 'payment', value: null },
    ])
    expect(result.score).toBeNull()
    expect(result.evaluated).toHaveLength(2)
  })

  it('NOMME les axes non évaluables au lieu de les faire disparaître', () => {
    // Un axe absent qui disparaîtrait ferait croire qu'il valait zéro.
    const result = scoreFromAxes([
      { axis: 'renewal', value: 80 },
      { axis: 'margin', value: null },
      { axis: 'payment', value: null },
    ])
    expect(result.notEvaluable).toEqual(['margin', 'payment'])
  })

  it('divise par le nombre d’axes RÉELLEMENT évalués', () => {
    // Diviser par cinq quand trois ont répondu mesurerait la complétude de nos
    // données, pas la mission.
    const result = scoreFromAxes([
      { axis: 'a', value: 90 },
      { axis: 'b', value: 60 },
      { axis: 'c', value: 30 },
      { axis: 'd', value: null },
    ])
    expect(result.score).toBe(60)
  })

  it('borne les valeurs hors échelle plutôt que de les propager', () => {
    const result = scoreFromAxes([
      { axis: 'a', value: 140 },
      { axis: 'b', value: -20 },
      { axis: 'c', value: 50 },
    ])
    expect(result.score).toBe(50)
  })
})

describe('computeCapacity', () => {
  it('rend `null` — jamais 0 — quand rien n’est mesurable', () => {
    // « 0 jour disponible » se lit « tout le monde est staffé », l'inverse de
    // « on ne sait pas ».
    const result = computeCapacity({ workingDays: null, people: 0, committedDays: null, unmeasured: 3 })
    expect(result.capacityDays).toBeNull()
    expect(result.availableDays).toBeNull()
  })

  it('ne soustrait jamais avec un terme inventé', () => {
    const result = computeCapacity({ workingDays: 21, people: 4, committedDays: null, unmeasured: 0 })
    expect(result.capacityDays).toBe(84)
    expect(result.availableDays).toBeNull()
  })

  it('ne rend pas de disponibilité négative', () => {
    // Un sur-engagement existe, mais « -6 jours à vendre » n'a aucun sens dans
    // une colonne « à vendre » — il se voit sur les jours engagés.
    const result = computeCapacity({ workingDays: 21, people: 1, committedDays: 27, unmeasured: 0 })
    expect(result.availableDays).toBe(0)
    expect(result.committedDays).toBe(27)
  })
})
