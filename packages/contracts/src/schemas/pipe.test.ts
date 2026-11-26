import { describe, expect, it } from 'vitest'
import {
  FORECAST_CATEGORIES,
  PIPE_RISK_THRESHOLDS,
  forecastCategorySchema,
  updateProjectForecastCategorySchema,
} from './pipe.js'

describe('catégorie déclarée', () => {
  it('quatre valeurs fermées, aucune probabilité', () => {
    expect([...FORECAST_CATEGORIES]).toEqual(['commit', 'best_case', 'pipeline', 'omitted'])
    expect(forecastCategorySchema.safeParse('commit').success).toBe(true)
    expect(forecastCategorySchema.safeParse('likely').success).toBe(false)
  })

  it('null efface la déclaration ; une clé de plus est refusée', () => {
    expect(updateProjectForecastCategorySchema.safeParse({ forecast_category: null }).success).toBe(true)
    expect(updateProjectForecastCategorySchema.safeParse({ forecast_category: 'omitted' }).success).toBe(true)
    expect(
      updateProjectForecastCategorySchema.safeParse({ forecast_category: 'commit', probability: 0.9 }).success,
    ).toBe(false)
    expect(updateProjectForecastCategorySchema.safeParse({}).success).toBe(false)
  })
})

describe('seuils de risque', () => {
  it('sont des constantes nommées, positives', () => {
    for (const value of Object.values(PIPE_RISK_THRESHOLDS)) expect(value).toBeGreaterThan(0)
  })
})
