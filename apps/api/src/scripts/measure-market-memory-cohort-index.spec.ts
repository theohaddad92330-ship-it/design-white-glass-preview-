import {
  MARKET_MEMORY_COHORT_INDEX_BUCKETS,
  MARKET_MEMORY_COHORT_INDEX_SETTINGS,
  MARKET_MEMORY_MIN_PATHS,
  buildCohortIndexReport,
  type CohortIndexSignal,
} from '@bellum/contracts'
import { formatReport, toCohortIndexSignal, type SignalRow } from './measure-market-memory-cohort-index'

describe('toCohortIndexSignal — la projection LUE depuis market_company_signal', () => {
  it('convertit le score numeric (string Postgres) en nombre', () => {
    const row: SignalRow = { companyKey: 'a', headcountBracket: '11-50', pathsTotal: 10, externalizationScore: '74.5' }
    expect(toCohortIndexSignal(row)).toEqual({
      companyKey: 'a',
      headcountBracket: '11-50',
      pathsTotal: 10,
      externalizationScore: 74.5,
    })
  })

  it('laisse `null` passer tel quel — jamais un 0 inventé', () => {
    const row: SignalRow = { companyKey: 'a', headcountBracket: null, pathsTotal: 1, externalizationScore: null }
    expect(toCohortIndexSignal(row).externalizationScore).toBeNull()
    expect(toCohortIndexSignal(row).headcountBracket).toBeNull()
  })

  it('un score illisible (non numérique) devient `null`, jamais NaN ni 0', () => {
    const row: SignalRow = { companyKey: 'a', headcountBracket: '11-50', pathsTotal: 10, externalizationScore: 'n/a' }
    expect(toCohortIndexSignal(row).externalizationScore).toBeNull()
  })
})

describe('formatReport — ce que rend le script contre une base réelle', () => {
  it('les comptes affichés s’ADDITIONNENT — lues = calculables + écartées', () => {
    const rows: CohortIndexSignal[] = [
      { companyKey: 'no-bracket', headcountBracket: null, pathsTotal: 10, externalizationScore: 50 },
      {
        companyKey: 'thin',
        pathsTotal: MARKET_MEMORY_MIN_PATHS - 1,
        headcountBracket: '11-50',
        externalizationScore: 50,
      },
    ]
    const report = buildCohortIndexReport(rows)
    const lines = formatReport(report).join('\n')
    expect(lines).toContain('lues 2')
    expect(lines).toContain('calculables 0')
    expect(lines).toContain('écartées 2')
    expect(lines).not.toContain('INCOHÉRENT')
  })

  it('nomme les cinq raisons d’exclusion, même à zéro', () => {
    const lines = formatReport(buildCohortIndexReport([])).join('\n')
    for (const reason of ['noBracket', 'belowGlobalMinPaths', 'noScore', 'belowOwnPathsThreshold', 'cohortTooSmall']) {
      expect(lines).toContain(reason)
    }
  })

  it('affiche un aperçu Forte/Moyenne/Faible marqué PROVISOIRE, et les trois seaux s’additionnent', () => {
    const n = MARKET_MEMORY_COHORT_INDEX_SETTINGS.minCohortSize
    const rows: CohortIndexSignal[] = Array.from({ length: n }, (_, i) => ({
      companyKey: `c${i}`,
      headcountBracket: '51-200',
      pathsTotal: MARKET_MEMORY_COHORT_INDEX_SETTINGS.minOwnPathsForIndex,
      externalizationScore: i, // étalé 0..n-1, pour peupler toute la distribution
    }))
    const report = buildCohortIndexReport(rows)
    const lines = formatReport(report)
    const joined = lines.join('\n')
    expect(joined).toContain('PROVISOIRE')
    const bucketLine = lines.find(line => line.includes('Forte'))
    expect(bucketLine).toBeDefined()
    const forte = Number(/Forte (\d+)/.exec(bucketLine ?? '')?.[1])
    const moyenne = Number(/Moyenne (\d+)/.exec(bucketLine ?? '')?.[1])
    const faible = Number(/Faible (\d+)/.exec(bucketLine ?? '')?.[1])
    expect(forte + moyenne + faible).toBe(report.counts.calculable)
  })

  it('sur un corpus sans aucun index calculable, le dit explicitement plutôt que de rendre un tableau vide muet', () => {
    const lines = formatReport(buildCohortIndexReport([])).join('\n')
    expect(lines).toMatch(/aucune|pas assez/i)
  })

  it('les bornes utilisées sont bien celles de `@bellum/contracts`, pas une copie locale', () => {
    const lines = formatReport(
      buildCohortIndexReport(
        Array.from({ length: MARKET_MEMORY_COHORT_INDEX_SETTINGS.minCohortSize }, (_, i) => ({
          companyKey: `c${i}`,
          headcountBracket: '51-200',
          pathsTotal: MARKET_MEMORY_COHORT_INDEX_SETTINGS.minOwnPathsForIndex,
          externalizationScore: i,
        })),
      ),
    ).join('\n')
    expect(lines).toContain(String(MARKET_MEMORY_COHORT_INDEX_BUCKETS.forteMin))
    expect(lines).toContain(String(MARKET_MEMORY_COHORT_INDEX_BUCKETS.moyenneMin))
  })
})
