import { describe, expect, it } from 'vitest'
import { libelleAxe, libelleLecture } from './workspace-health-panel.logic'

describe('libelleLecture — le verdict de santé produit, jamais un tiret muet', () => {
  it('nomme chacun des quatre états mesurés', () => {
    expect(libelleLecture('healthy', 0)).toBe('Sain')
    expect(libelleLecture('watch', 0)).toBe('À surveiller')
    expect(libelleLecture('at_risk', 0)).toBe('À risque')
    expect(libelleLecture('critical', 0)).toBe('Critique')
  })

  it('nomme le cinquième état — Amorçage (#2406.13), jamais confondu avec « mauvais »', () => {
    expect(libelleLecture('bootstrapping', 1)).toBe('Amorçage — 1 axe manquant pour un score')
    expect(libelleLecture('bootstrapping', 2)).toBe('Amorçage — 2 axes manquants pour un score')
  })

  it('un score null se dit — jamais un tiret — avec le nombre d’axes qui manquent (défensif)', () => {
    expect(libelleLecture(null, 1)).toBe("Pas assez d'axes évalués (1 manquant)")
    expect(libelleLecture(null, 2)).toBe("Pas assez d'axes évalués (2 manquants)")
  })
})

describe('libelleAxe — un axe non évaluable ne s’affiche jamais comme un zéro', () => {
  it('affiche la valeur sur 100 quand l’axe est mesuré', () => {
    expect(libelleAxe({ axis: 'quality', label: 'Qualité', value: 42, nonEvaluable: false, reason: null })).toBe(
      '42/100',
    )
  })

  it('nomme la raison plutôt que d’afficher 0 quand l’axe est non évaluable', () => {
    expect(
      libelleAxe({
        axis: 'connectors',
        label: 'Connecteurs',
        value: null,
        nonEvaluable: true,
        reason: 'aucun connecteur configuré',
      }),
    ).toBe('non mesurable — aucun connecteur configuré')
  })
})
