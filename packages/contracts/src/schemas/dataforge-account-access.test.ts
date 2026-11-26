import { describe, expect, it } from 'vitest'
import { dataforgeAccountAccessSchema, dataforgeAccountAccessView } from './dataforge-account-access.js'

const blank = {
  salesAccessibilityLevel: null,
  barrierePlateforme: false,
  barrierePublique: false,
  referencingProcessFound: null,
  supplierPortal: null,
  priorityLevel: null,
  observedAt: '2026-10-01T00:00:00.000Z',
}

describe('dataforgeAccountAccessView', () => {
  it('rend null quand rien ne dit rien — jamais un bloc de zéros', () => {
    expect(dataforgeAccountAccessView(blank)).toBeNull()
  })

  it('traduit les codes bruts en énumérations métier, sans jamais rendre le code', () => {
    const view = dataforgeAccountAccessView({
      ...blank,
      salesAccessibilityLevel: 'HAUTE',
      barrierePlateforme: true,
      priorityLevel: 'P1',
    })
    expect(view).toEqual({
      accessibility: 'high',
      barriers: ['platform'],
      route: 'platform',
      priority: 'high',
      observedAt: '2026-10-01T00:00:00.000Z',
    })
    expect(JSON.stringify(view)).not.toMatch(/HAUTE|P1/)
    expect(dataforgeAccountAccessSchema.safeParse(view).success).toBe(true)
  })

  it('un code inconnu reste absent plutôt que d’être deviné ou recopié', () => {
    const view = dataforgeAccountAccessView({ ...blank, salesAccessibilityLevel: 'ZZZ', supplierPortal: 'oui' })
    expect(view?.accessibility).toBeNull()
    expect(view?.route).toBe('supplier_portal')
  })

  it('ne porte aucun champ identifiant ni score nu', () => {
    const view = dataforgeAccountAccessView({ ...blank, priorityLevel: 'MOYENNE' })
    expect(Object.keys(view ?? {}).sort()).toEqual(['accessibility', 'barriers', 'observedAt', 'priority', 'route'])
  })
})
