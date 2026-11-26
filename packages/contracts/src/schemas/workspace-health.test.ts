import { describe, expect, it } from 'vitest'
import {
  adoptionBudgetFor,
  computeWorkspaceHealth,
  DIMENSION_INTERVENTION_THRESHOLD,
  dimensionInterventions,
  HEALTH_AXES,
  HEALTH_AXIS_LABELS,
  HEALTH_AXIS_UNMEASURED_REASON,
  HEALTH_READINGS,
  HEALTH_WEIGHTS,
  healthCoverageLabel,
  healthDimensions,
  MIN_AXES_FOR_HEALTH,
  readingFor,
  shouldAlertTeam,
  type HealthInput,
} from './workspace-health.js'

const NOTHING: HealthInput = {
  activation: null,
  connectors: null,
  dataDensity: null,
  teamAdoption: null,
  depth: null,
  consumption: null,
  quality: null,
  actionability: null,
  value: null,
}

const PERFECT: HealthInput = {
  activation: 1,
  connectors: 1,
  dataDensity: 1,
  teamAdoption: 1,
  depth: 1,
  consumption: 1,
  quality: 1,
  actionability: 1,
  value: 1,
}

describe('le barème', () => {
  it('somme à 100 — vérifié, pas additionné de tête', () => {
    expect(Object.values(HEALTH_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100)
    expect(Object.keys(HEALTH_WEIGHTS).sort()).toEqual([...HEALTH_AXES].sort())
  })

  it('porte NEUF axes — #2977 ajoute actionability et value aux sept déjà là', () => {
    expect(HEALTH_AXES).toHaveLength(9)
    expect(HEALTH_AXES).toContain('actionability')
    expect(HEALTH_AXES).toContain('value')
  })
})

describe('un axe non évaluable SORT du dénominateur', () => {
  it('ne rend AUCUN score sous trois axes', () => {
    // Un chiffre calculé sur un seul axe est un chiffre faux qui a l'air d'un
    // chiffre : c'est ce qui ferait afficher « critique » sur un espace créé
    // hier.
    const health = computeWorkspaceHealth({ ...NOTHING, activation: 0.1, connectors: 0 })
    expect(health.score).toBeNull()
    // #2406.13 — nommée « Amorçage », jamais un `null` muet.
    expect(health.reading).toBe('bootstrapping')
    expect(health.missingAxes).toBe(MIN_AXES_FOR_HEALTH - 2)
    expect(health.notEvaluable).toHaveLength(HEALTH_AXES.length - 2)
  })

  it('rend 100 sur trois axes parfaits, pas 45', () => {
    // Le piège que ce test verrouille : rapporter à 100 au lieu de rapporter à
    // la somme des poids évalués donnerait 50/100 à un espace sans défaut.
    const health = computeWorkspaceHealth({
      ...NOTHING,
      activation: 1,
      connectors: 1,
      dataDensity: 1,
    })
    expect(health.score).toBe(100)
    expect(health.reading).toBe('healthy')
    expect(health.evaluated).toEqual(['activation', 'connectors', 'dataDensity'])
  })

  it('NOMME ce qu’il n’a pas pu évaluer', () => {
    const health = computeWorkspaceHealth({ ...PERFECT, quality: null, consumption: null })
    expect(health.notEvaluable).toEqual(['consumption', 'quality'])
    expect(health.evaluated).not.toContain('quality')
  })

  it('ne confond pas « non mesurable » et « zéro »', () => {
    const unknown = computeWorkspaceHealth({ ...PERFECT, activation: null })
    const zero = computeWorkspaceHealth({ ...PERFECT, activation: 0 })
    expect(unknown.score).toBe(100)
    expect(zero.score).toBe(80)
  })
})

describe('les deux axes ajoutés par #2977', () => {
  it('actionability et value comptent comme les sept autres', () => {
    const health = computeWorkspaceHealth({ ...PERFECT, actionability: 0, value: 0 })
    expect(health.evaluated).toContain('actionability')
    expect(health.evaluated).toContain('value')
    expect(health.score).toBeLessThan(100)
  })

  it('non mesurables, ils sortent du dénominateur comme les autres', () => {
    const health = computeWorkspaceHealth({ ...PERFECT, actionability: null, value: null })
    expect(health.notEvaluable).toEqual(['actionability', 'value'])
    expect(health.score).toBe(100)
  })
})

describe('la cause principale', () => {
  it('désigne l’axe qui coûte le plus de POINTS, pas le ratio le plus bas', () => {
    // Un axe à 0 qui pèse 10 fait moins de mal qu'un axe à 0,4 qui pèse 20, et
    // c'est celui-là qu'il faut réparer d'abord.
    const health = computeWorkspaceHealth({ ...PERFECT, quality: 0, activation: 0.4 })
    expect(health.mainCause).toBe('activation')
  })

  it('n’en désigne aucune quand rien ne manque', () => {
    expect(computeWorkspaceHealth(PERFECT).mainCause).toBeNull()
  })

  it('n’en désigne aucune quand il n’y a pas de score', () => {
    expect(computeWorkspaceHealth(NOTHING).mainCause).toBeNull()
  })
})

describe('les quatre lectures', () => {
  it.each([
    [100, 'healthy'],
    [75, 'healthy'],
    [74, 'watch'],
    [50, 'watch'],
    [49, 'at_risk'],
    [25, 'at_risk'],
    [24, 'critical'],
    [0, 'critical'],
  ] as const)('%i → %s', (score, reading) => {
    expect(readingFor(score)).toBe(reading)
  })
})

describe('l’alerte commerciale (D50)', () => {
  it('se déclenche sous 25', () => {
    expect(
      shouldAlertTeam(computeWorkspaceHealth({ ...NOTHING, activation: 0, connectors: 0, dataDensity: 0.1 })),
    ).toBe(true)
  })

  it('ne se déclenche JAMAIS sans score', () => {
    // Un espace créé hier ressemble à un espace qu'on perd. Alerter dessus
    // ferait appeler des clients qui viennent d'arriver — après quoi plus
    // personne ne regarderait l'alerte.
    expect(shouldAlertTeam(computeWorkspaceHealth(NOTHING))).toBe(false)
    expect(shouldAlertTeam(computeWorkspaceHealth({ ...NOTHING, activation: 0, connectors: 0 }))).toBe(false)
  })

  it('ne se déclenche pas sur un espace seulement à risque', () => {
    expect(shouldAlertTeam(computeWorkspaceHealth({ ...PERFECT, activation: 0, connectors: 0, depth: 0 }))).toBe(false)
  })
})

describe('le budget d’interventions d’adoption', () => {
  it('se TAIT sur un espace sain', () => {
    // « Se tait, sauf valeur métier réelle » — le §5.6 est explicite.
    expect(adoptionBudgetFor('healthy')).toBe(0)
  })

  it('n’en accorde qu’une à surveiller, trois quand ça va mal', () => {
    expect(adoptionBudgetFor('watch')).toBe(1)
    expect(adoptionBudgetFor('at_risk')).toBe(3)
    expect(adoptionBudgetFor('critical')).toBe(3)
  })

  it('n’accorde RIEN quand le score est inconnu', () => {
    // On ne sait pas ce qui manque : toute intervention serait un coup de sonde
    // sur le dos de l'utilisateur.
    expect(adoptionBudgetFor(null)).toBe(0)
  })

  it('n’accorde RIEN sur un espace en amorçage (#2406.13)', () => {
    expect(adoptionBudgetFor('bootstrapping')).toBe(0)
  })
})

describe('la cinquième lecture — Amorçage (#2406.13)', () => {
  it('est nommée plutôt que muette sous le minimum d’axes', () => {
    expect(HEALTH_READINGS).toContain('bootstrapping')
    expect(computeWorkspaceHealth(NOTHING).reading).toBe('bootstrapping')
  })

  it('ne déclenche jamais l’alerte commerciale — un espace qui démarre n’est pas un espace qui part', () => {
    expect(shouldAlertTeam(computeWorkspaceHealth(NOTHING))).toBe(false)
  })
})

describe('les dimensions de la vue admin/pilotage (#2977)', () => {
  it('rend les NEUF axes, dans l’ordre de HEALTH_AXES, chacun nommé', () => {
    const dims = healthDimensions(PERFECT)
    expect(dims.map(d => d.axis)).toEqual([...HEALTH_AXES])
    for (const dim of dims) {
      expect(dim.label).toBe(HEALTH_AXIS_LABELS[dim.axis])
      expect(dim.value).toBe(100)
      expect(dim.nonEvaluable).toBe(false)
      expect(dim.reason).toBeNull()
    }
  })

  it('nomme la RAISON d’un axe non évaluable, jamais un zéro tu', () => {
    const dims = healthDimensions({ ...PERFECT, connectors: null })
    const connectors = dims.find(d => d.axis === 'connectors')
    expect(connectors?.value).toBeNull()
    expect(connectors?.nonEvaluable).toBe(true)
    expect(connectors?.reason).toBe(HEALTH_AXIS_UNMEASURED_REASON.connectors)
  })

  it('convertit le ratio en valeur sur 100', () => {
    const dims = healthDimensions({ ...NOTHING, activation: 0.42 })
    expect(dims.find(d => d.axis === 'activation')?.value).toBe(42)
  })

  it('le libellé de couverture nomme le dénominateur RÉEL, jamais 9 fixe', () => {
    const health = computeWorkspaceHealth({ ...NOTHING, activation: 1, connectors: 1, dataDensity: 1 })
    expect(healthCoverageLabel(health)).toBe('3/9 axes évalués')
    expect(healthCoverageLabel(computeWorkspaceHealth(PERFECT))).toBe('9/9 axes évalués')
  })
})

describe('les interventions par dimension (#2977, seuil nommé)', () => {
  it('propose une action pour chaque dimension évaluée sous le seuil', () => {
    const interventions = dimensionInterventions({ ...PERFECT, quality: 0.4, connectors: 0.1 })
    expect(interventions).toHaveLength(2)
    expect(interventions.every(i => i.value < DIMENSION_INTERVENTION_THRESHOLD)).toBe(true)
    expect(interventions.map(i => i.axis).sort()).toEqual(['connectors', 'quality'])
  })

  it('ne propose RIEN pour une dimension non évaluable — jamais de cause devinée', () => {
    const interventions = dimensionInterventions({ ...PERFECT, quality: null })
    expect(interventions.find(i => i.axis === 'quality')).toBeUndefined()
  })

  it('ne propose RIEN sur un espace parfait', () => {
    expect(dimensionInterventions(PERFECT)).toEqual([])
  })

  it('ne propose jamais deux fois la même dimension', () => {
    const interventions = dimensionInterventions({ ...NOTHING, activation: 0 })
    expect(interventions.filter(i => i.axis === 'activation')).toHaveLength(1)
  })
})
