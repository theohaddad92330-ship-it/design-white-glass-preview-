import { humanizeChartLabel, readCockpit } from './cockpit'
import type { GridSheet } from './xlsx-grid'

/** Démo clients 04/10 : un libellé de graphique en ENUM_BRUT devient une phrase lisible. */
describe('humanizeChartLabel', () => {
  it('transforme un token MAJUSCULES_AVEC_UNDERSCORES en phrase', () => {
    expect(humanizeChartLabel('RECOMMANDATION_COMMERCIALE')).toBe('Recommandation commerciale')
    expect(humanizeChartLabel('TVA_CAS_PAR_CAS')).toBe('TVA cas par cas')
    expect(humanizeChartLabel('METHODE_CHIFFRAGE_ANALYTIQUE')).toBe('Méthode chiffrage analytique')
    expect(humanizeChartLabel('ROUTE_A_QUALIFIER')).toBe('Route à qualifier')
    expect(humanizeChartLabel('SOCIAL_A1')).toBe('Social A1')
    expect(humanizeChartLabel('CONDITIONS_TRAVAIL')).toBe('Conditions travail')
  })

  it('laisse intact tout libellé contenant un espace (code d’entité compris)', () => {
    expect(humanizeChartLabel('CIB_ALMT IT Risk & PnL - BA PnL')).toBe('CIB_ALMT IT Risk & PnL - BA PnL')
    expect(humanizeChartLabel('Support Technique Cloud')).toBe('Support Technique Cloud')
  })

  it('laisse intact un mot simple ou un sigle', () => {
    expect(humanizeChartLabel('TVA')).toBe('TVA')
    expect(humanizeChartLabel('Non renseigné')).toBe('Non renseigné')
  })
})

describe('readCockpit — libellés de graphique', () => {
  const sheet = (rows: Record<number, string>[]): GridSheet => ({
    name: 'COCKPIT',
    badCells: 0,
    rows: rows
      .map((cells, i) => ({
        n: i + 1,
        cells: new Map(Object.entries(cells).map(([c, v]) => [Number(c), v])),
        links: new Map<number, string>(),
      }))
      .filter(r => r.cells.size > 0),
  })

  it('humanise les libellés de graphique à la lecture', () => {
    const cockpit = readCockpit(
      sheet([
        { 2: 'T — VOICI TOUT CE QUE JE SAIS' },
        { 2: 'Sous-titre' },
        { 2: 'A', 3: 'B' },
        { 2: '1', 3: '2' },
        { 2: 'CE QUE JE SAIS — EN UNE PAGE' },
        { 2: 'IDENTITÉ', 3: 'x', 6: 'y' },
        { 2: 'RÈGLES PAR RÉGIME' },
        { 2: 'Libellé', 3: 'Valeur' },
        { 2: 'TVA_CAS_PAR_CAS', 3: '3' },
      ]),
      (_name, v) => v,
    )
    expect(cockpit.charts[0].items[0].label).toBe('TVA cas par cas')
  })
})
