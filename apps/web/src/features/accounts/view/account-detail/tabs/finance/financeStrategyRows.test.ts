import { describe, expect, it } from 'vitest'
import { buildFinanceExercises } from './financeStrategyRows'

// #4745 — l'onglet « Stratégie financière » lit les exercices publiés du compte ANALYSÉ.
describe('buildFinanceExercises', () => {
  it('trie du plus récent au plus ancien', () => {
    const rows = buildFinanceExercises([{ year: 2022 }, { year: 2024 }, { year: 2023 }])
    expect(rows.map(r => r.year)).toEqual([2024, 2023, 2022])
  })

  it('une valeur non publiée vaut null, jamais 0', () => {
    const [row] = buildFinanceExercises([{ year: 2023, revenue: 1000 }])
    expect(row?.grossMargin).toBeNull()
    expect(row?.ebitda).toBeNull()
    expect(row?.operatingResult).toBeNull()
    expect(row?.grossMarginRate).toBeNull()
    expect(row?.isPublished).toBe(false)
  })

  it('calcule le taux de marge brute seulement avec un CA > 0 et une marge publiée', () => {
    const rows = buildFinanceExercises([
      { year: 2023, revenue: 1000, gross_margin: 400 },
      { year: 2022, revenue: 0, gross_margin: 400 },
      { year: 2021, revenue: null, gross_margin: 400 },
    ])
    expect(rows[0]?.grossMarginRate).toBe(40)
    expect(rows[1]?.grossMarginRate).toBeNull()
    expect(rows[2]?.grossMarginRate).toBeNull()
  })

  it('un exercice est publié dès qu’une des quatre valeurs de l’onglet existe', () => {
    const [row] = buildFinanceExercises([{ year: 2023, ebitda: 90 }])
    expect(row?.isPublished).toBe(true)
  })

  it('ignore une ligne sans année', () => {
    expect(buildFinanceExercises([{ year: null, gross_margin: 1 }, {}])).toEqual([])
  })

  it('aucun exercice → liste vide', () => {
    expect(buildFinanceExercises(undefined)).toEqual([])
  })
})
