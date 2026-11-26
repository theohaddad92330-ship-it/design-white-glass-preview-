import { describe, expect, it } from 'vitest'
import { MANAGER_KPIS } from './manager-kpi.js'
import { KPI_READINGS } from './manager-kpi-reading.js'

// #3415 — chaque indicateur du dictionnaire dit quelle tendance inquiète et
// quelle cause chercher d'abord ; une lecture sans indicateur est orpheline.
describe('KPI_READINGS (#3415)', () => {
  it('chaque indicateur du dictionnaire porte sa tendance et sa cause', () => {
    for (const kpi of MANAGER_KPIS) {
      expect(kpi.probableCause.length, kpi.key).toBeGreaterThan(10)
      expect(['down', 'up', 'either'], kpi.key).toContain(kpi.worryingTrend)
    }
  })

  it('aucune lecture orpheline : chaque clé est un indicateur', () => {
    const keys = new Set(MANAGER_KPIS.map(kpi => kpi.key))
    expect(Object.keys(KPI_READINGS).filter(key => !keys.has(key))).toEqual([])
  })

  it('une cause n’énonce pas de chiffre : le seuil et la cible vivent ailleurs (GA-26)', () => {
    expect(
      Object.entries(KPI_READINGS)
        .filter(([, r]) => /\d{2,}|\d\s*%/.test(r.cause))
        .map(([k]) => k),
    ).toEqual([])
  })
})

describe('#3415 — la tendance MESURÉE : seuls les indicateurs qui ont une photo mensuelle', () => {
  it('chaque indicateur déclaré existe au dictionnaire ET porte une série photographiée', async () => {
    const { KPI_MEASURED_TREND_METRIC } = await import('./manager-kpi-reading.js')
    const { MANAGER_KPIS } = await import('./manager-kpi.js')
    const { STOCK_METRIC_KEYS } = await import('./stock-snapshot.js')
    const keys = Object.keys(KPI_MEASURED_TREND_METRIC)
    expect(keys.length).toBeGreaterThan(0)
    for (const key of keys) {
      expect(MANAGER_KPIS.some(kpi => kpi.key === key)).toBe(true)
      expect(STOCK_METRIC_KEYS).toContain(KPI_MEASURED_TREND_METRIC[key])
    }
  })

  it('#3415 — « Besoins sans shortlist » lit la photo des besoins sans profil positionné (même compteur)', async () => {
    const { KPI_MEASURED_TREND_METRIC } = await import('./manager-kpi-reading.js')
    expect(KPI_MEASURED_TREND_METRIC.needs_without_shortlist).toBe('needs_without_positioning')
  })

  it('le test qui dit NON : un indicateur sans photo mensuelle n’est pas déclaré', async () => {
    const { KPI_MEASURED_TREND_METRIC } = await import('./manager-kpi-reading.js')
    expect(KPI_MEASURED_TREND_METRIC).not.toHaveProperty('revenue_growth')
    expect(KPI_MEASURED_TREND_METRIC).not.toHaveProperty('dso_days')
  })
})
