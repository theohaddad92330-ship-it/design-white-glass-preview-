import { describe, expect, it } from 'vitest'
import { buildTourSteps, clampStepIndex } from './guided-tour.logic'

/**
 * #1678.2 — LA logique de la visite guidée : la séquence des étapes (bienvenue
 * → Cockpit → une étape par section du rail, dans l'ORDRE du rail → clôture),
 * et le bornage de l'index courant.
 */

const SECTIONS = [
  { id: 'revenus', label: 'Revenus' },
  { id: 'produit', label: 'Produit' },
  { id: 'technique', label: 'Technique' },
  { id: 'administration', label: 'Administration' },
  { id: 'configuration', label: 'Configuration' },
]

describe('buildTourSteps — une étape par section, dans l’ordre du rail', () => {
  it('bienvenue, Cockpit, les cinq sections, puis la clôture', () => {
    const steps = buildTourSteps(SECTIONS)
    expect(steps.map(s => s.id)).toEqual([
      'welcome',
      'cockpit',
      'section-revenus',
      'section-produit',
      'section-technique',
      'section-administration',
      'section-configuration',
      'closing',
    ])
  })

  it('chaque étape de section porte un sélecteur DOM distinct', () => {
    const steps = buildTourSteps(SECTIONS)
    const selectors = steps.map(s => s.targetSelector).filter((s): s is string => s !== null)
    expect(new Set(selectors).size).toBe(selectors.length)
  })

  it('sait dire NON — une section inconnue du rail est ignorée, pas plantée', () => {
    const steps = buildTourSteps([...SECTIONS, { id: 'section-du-futur', label: 'Nouvelle section' }])
    expect(steps.some(s => s.id === 'section-section-du-futur')).toBe(false)
    // Les huit étapes connues restent toutes là — une section inconnue n'en
    // fait pas disparaître d'autres.
    expect(steps).toHaveLength(8)
  })
})

describe('clampStepIndex — jamais avant la première étape, jamais après la dernière', () => {
  it('borne un index négatif à 0', () => {
    expect(clampStepIndex(-3, 8)).toBe(0)
  })

  it('borne un index trop grand au dernier index valide', () => {
    expect(clampStepIndex(99, 8)).toBe(7)
  })

  it('laisse passer un index valide', () => {
    expect(clampStepIndex(3, 8)).toBe(3)
  })

  it('sait dire NON sur zéro étape — jamais un index négatif', () => {
    expect(clampStepIndex(5, 0)).toBe(0)
  })
})
