import { ACCOUNT_STRATEGY_5P_DIMENSIONS } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { strategyDimensionToPlanAction } from './strategyPlanAction'

/**
 * #3277.3 — « le `next_action_dimension` devrait pouvoir générer une action de
 * plan ciblée sur cette dimension ». Une action par P, jamais un texte
 * générique : le libellé NOMME la dimension, la raison dit d'où elle vient.
 */
describe('strategyDimensionToPlanAction', () => {
  const NOW = new Date('2026-10-02T09:00:00.000Z')

  it('écrit une action distincte et nommée pour chacun des cinq P', () => {
    const labels = ACCOUNT_STRATEGY_5P_DIMENSIONS.map(dimension => strategyDimensionToPlanAction(dimension, NOW).label)
    expect(new Set(labels).size).toBe(5)
    for (const label of labels) expect(label.length).toBeGreaterThan(10)
  })

  it('ne devine aucun objet ni aucun responsable : target nul, échéance datée, raison tracée', () => {
    const action = strategyDimensionToPlanAction('people', NOW)
    expect(action.target).toBeNull()
    expect(action.due_date).toMatch(/^2026-10-/)
    expect(action.reason).toMatch(/5P/)
    expect(action.label).toMatch(/personnes|rôle|décideur/i)
  })
})
