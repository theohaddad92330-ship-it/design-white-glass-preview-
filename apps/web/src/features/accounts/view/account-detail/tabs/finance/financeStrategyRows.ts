import type { FinancialYear } from '@bellum/contracts'

/** Un exercice du compte ANALYSÉ — jamais celui de l'ESN utilisatrice. `null` = non publié, jamais 0. */
interface FinanceExercise {
  year: number
  closingDate: string | null
  grossMargin: number | null
  /** Marge brute rapportée au CA du même exercice ; `null` sans CA > 0 ou sans marge publiée. */
  grossMarginRate: number | null
  ebitda: number | null
  operatingResult: number | null
  /** Au moins une des valeurs que l'onglet porte existe pour cet exercice. */
  isPublished: boolean
}

const finite = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

export function buildFinanceExercises(history: readonly FinancialYear[] | undefined): FinanceExercise[] {
  return (history ?? [])
    .flatMap((row): FinanceExercise[] => {
      const year = finite(row.year)
      if (year === null) return []
      const grossMargin = finite(row.gross_margin)
      const revenue = finite(row.revenue)
      const ebitda = finite(row.ebitda)
      const operatingResult = finite(row.operating_result)
      return [
        {
          year,
          closingDate: row.closing_date?.trim() || null,
          grossMargin,
          grossMarginRate:
            grossMargin !== null && revenue !== null && revenue > 0 ? (grossMargin / revenue) * 100 : null,
          ebitda,
          operatingResult,
          isPublished: grossMargin !== null || ebitda !== null || operatingResult !== null,
        },
      ]
    })
    .sort((a, b) => b.year - a.year)
}
