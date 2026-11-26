import { financialYearSchema } from '@bellum/contracts'
import { DEMO_DELIVERY_CARRIER, DEMO_DOSSIERS } from './demo-dataset'

/**
 * #4745.8 (arbitrage Louis 29/10/2026) — l'onglet « Stratégie financière » est REMPLI en démo (craft rule n°9) :
 * marge brute, EBE et résultat d'exploitation FICTIFS, semés sur le client fictif de la salle (SNCF y est fictif,
 * `DEMO_DELIVERY_CARRIER`). Un exercice reste volontairement incomplet, pour que la salle montre aussi « Non publié ».
 */
const history = (name: string) =>
  (DEMO_DOSSIERS.find(d => d.account.company_name === name)?.account.raw_analysis.financials_history ?? []) as unknown[]

describe('démo — l’onglet Stratégie financière est rempli', () => {
  const rows = history(DEMO_DELIVERY_CARRIER).map(row => financialYearSchema.parse(row))

  it('le client fictif porte au moins deux exercices datés, dont un complet', () => {
    expect(rows.length).toBeGreaterThanOrEqual(2)
    const complete = rows.filter(
      r => r.closing_date && r.gross_margin != null && r.ebitda != null && r.operating_result != null,
    )
    expect(complete.length).toBeGreaterThanOrEqual(1)
  })

  it('un exercice reste « non publié » à dessein : une valeur absente est null, jamais 0', () => {
    expect(rows.some(r => r.ebitda === null)).toBe(true)
    for (const r of rows) for (const v of [r.gross_margin, r.ebitda, r.operating_result]) expect(v).not.toBe(0)
  })

  it('les marges sont cohérentes avec le CA du même exercice (marge ≤ CA)', () => {
    for (const r of rows)
      if (r.gross_margin != null && r.revenue != null) expect(r.gross_margin).toBeLessThanOrEqual(r.revenue)
  })

  it('sait dire NON : les autres dossiers réels ne reçoivent aucune marge inventée', () => {
    const others = DEMO_DOSSIERS.filter(d => d.account.company_name !== DEMO_DELIVERY_CARRIER)
    expect(others.length).toBeGreaterThan(0)
    for (const d of others)
      for (const row of history(d.account.company_name).map(r => financialYearSchema.parse(r))) {
        expect({
          d: d.account.company_name,
          g: row.gross_margin ?? null,
          e: row.ebitda ?? null,
          o: row.operating_result ?? null,
        }).toEqual({
          d: d.account.company_name,
          g: null,
          e: null,
          o: null,
        })
      }
  })
})
