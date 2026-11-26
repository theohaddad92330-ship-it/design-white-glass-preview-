import { describe, expect, it } from 'vitest'
import { parseAccountAnalysis } from './account-analysis.js'

// #4744 — la profondeur financière du compte ANALYSÉ traverse le contrat (camelCase ou snake_case
// à l'entrée, snake_case à la sortie) ; une valeur absente reste ABSENTE, jamais 0.
describe('financials_history — profondeur de l’exercice (#4744)', () => {
  it('garde la clôture, la marge brute, l’EBE et le résultat d’exploitation', () => {
    const analysis = parseAccountAnalysis({
      financialsHistory: [
        {
          year: 2023,
          revenue: 1000,
          closingDate: '2023-12-31',
          grossMargin: 400,
          ebitda: 90,
          operatingResult: 70,
        },
      ],
    })
    expect(analysis.financials_history?.[0]).toMatchObject({
      closing_date: '2023-12-31',
      gross_margin: 400,
      ebitda: 90,
      operating_result: 70,
    })
  })

  it('laisse absent ce qui n’est pas publié', () => {
    const analysis = parseAccountAnalysis({ financialsHistory: [{ year: 2022, revenue: 900 }] })
    const row = analysis.financials_history?.[0]
    expect(row?.gross_margin ?? null).toBeNull()
    expect(row?.ebitda ?? null).toBeNull()
  })
})
