import { describe, expect, it } from 'vitest'
import {
  buildSecFinancialRows,
  formatCount,
  formatEuros,
  formatPercent,
  formatUsd,
  mergeTechStack,
  splitJobsByTrade,
} from './publicDataViewData'

const names = (rows: ReturnType<typeof mergeTechStack>) => rows.map(row => row.name)

describe('mergeTechStack', () => {
  it('unions detected + Apollo, deduped case-insensitively, order-preserving', () => {
    expect(names(mergeTechStack(['React', 'AWS'], ['aws', 'Salesforce']))).toEqual(['React', 'AWS', 'Salesforce'])
  })

  it('drops blanks and non-strings, is bounded', () => {
    expect(names(mergeTechStack(['  ', 'React', ''], undefined))).toEqual(['React'])
    expect(
      mergeTechStack(
        Array.from({ length: 40 }, (_, i) => `T${i}`),
        undefined,
        undefined,
        5,
      ),
    ).toHaveLength(5)
  })

  it('returns [] when every source is empty/absent', () => {
    expect(mergeTechStack(undefined, undefined)).toEqual([])
    expect(mergeTechStack([], [], [])).toEqual([])
  })

  /**
   * La TROISIÈME source : `raw_analysis.technology_stack[]`, que la carte ne
   * lisait pas du tout. Un compte dont l'analyse a relevé une stack mais dont
   * la détection sur site n'a rien rendu n'affichait AUCUNE carte technique.
   */
  it('reads the analysis stack, which no screen read before', () => {
    const rows = mergeTechStack(undefined, undefined, [
      { name: 'Cloud hybride', usage: 'Modernisation des infrastructures', maturity: 'production' },
    ])
    expect(rows).toEqual([
      { name: 'Cloud hybride', usage: 'Modernisation des infrastructures', maturity: 'production' },
    ])
  })

  /** L'analyse passe en premier : elle seule porte l'usage et la maturité. */
  it('keeps the analysis entry when a bare detected name duplicates it', () => {
    const rows = mergeTechStack(['cloud hybride'], undefined, [
      { name: 'Cloud hybride', usage: 'Modernisation', maturity: 'production' },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({ name: 'Cloud hybride', usage: 'Modernisation', maturity: 'production' })
  })

  /** Un nom détecté sans analyse n'invente ni usage ni maturité : `null`. */
  it('leaves usage and maturity null for a bare detected name', () => {
    expect(mergeTechStack(['React'], undefined)).toEqual([{ name: 'React', usage: null, maturity: null }])
  })

  /** `maturity` accepte l'enum ET une chaîne libre ; illisible vaut `null`. */
  it('drops an unreadable maturity rather than rendering it', () => {
    const rows = mergeTechStack(undefined, undefined, [{ name: 'Kafka', usage: null, maturity: null }])
    expect(rows).toEqual([{ name: 'Kafka', usage: null, maturity: null }])
  })

  it('drops analysis entries the model left unnamed', () => {
    expect(mergeTechStack(undefined, undefined, [{ name: null, usage: 'x', maturity: 'production' }])).toEqual([])
  })
})

describe('numeric formatters (present-only)', () => {
  it('formatEuros returns null for missing / non-finite, a compact string otherwise', () => {
    expect(formatEuros(undefined, 'fr')).toBeNull()
    expect(formatEuros(null, 'fr')).toBeNull()
    expect(formatEuros(Number.NaN, 'fr')).toBeNull()
    expect(formatEuros(1500000, 'fr')).toMatch(/€/)
  })

  it('formatCount returns null for missing, a localised integer otherwise', () => {
    expect(formatCount(undefined, 'en')).toBeNull()
    expect(formatCount(42, 'en')).toBe('42')
  })

  it('formatPercent appends a percent sign, null when absent', () => {
    expect(formatPercent(undefined, 'fr')).toBeNull()
    expect(formatPercent(55, 'fr')).toBe('55 %')
    expect(formatPercent(55, 'en')).toBe('55%')
  })

  it('formatUsd returns null for missing / non-finite, a compact USD string otherwise', () => {
    expect(formatUsd(undefined, 'en')).toBeNull()
    expect(formatUsd(null, 'fr')).toBeNull()
    expect(formatUsd(Number.NaN, 'en')).toBeNull()
    expect(formatUsd(5457056000, 'en')).toMatch(/\$/)
  })
})

describe('buildSecFinancialRows (SEC annual revenue + net income merge)', () => {
  it('merges revenue + net income by fiscal-period end, recent-first, carrying the filing date', () => {
    const rows = buildSecFinancialRows({
      revenues: [
        { end: '2024-12-31', val: 4690540000, filed: '2025-02-20' },
        { end: '2025-12-31', val: 5457056000, filed: '2026-02-26' },
      ],
      net_income: [{ end: '2025-12-31', val: 377678000, filed: '2026-02-26' }],
    })
    expect(rows.map(r => r.end)).toEqual(['2025-12-31', '2024-12-31'])
    expect(rows[0]).toEqual({ end: '2025-12-31', revenue: 5457056000, netIncome: 377678000, filed: '2026-02-26' })
    expect(rows[1]).toEqual({ end: '2024-12-31', revenue: 4690540000, netIncome: null, filed: '2025-02-20' })
  })

  it('is present-only: empty / absent input yields no rows, bounded output', () => {
    expect(buildSecFinancialRows(undefined)).toEqual([])
    expect(buildSecFinancialRows(null)).toEqual([])
    expect(buildSecFinancialRows({ revenues: [], net_income: [] })).toEqual([])
    const many = Array.from({ length: 8 }, (_, i) => ({ end: `20${10 + i}-12-31`, val: i, filed: null }))
    expect(buildSecFinancialRows({ revenues: many }, 3)).toHaveLength(3)
  })
})

// #4396.1 (recette prod 23/10, fiche Guerbet) — « Offres d'emploi IT » : 6 offres sur 6 hors IT (Audit interne,
// Acheteur, Technicien AQ). Le bloc ne montre que les offres du métier de l'ESN (même verdict que les signaux) ;
// les autres sont rangées à part, jamais effacées.
describe('splitJobsByTrade — #4396.1', () => {
  const profile = { placedRoles: ['Développeur Java', 'Data engineer'], noGoSectors: [], recruitsForClients: false }
  const jobs = [
    { title: 'Auditeur interne' },
    { title: 'Développeur Java confirmé' },
    { title: 'Acheteur projets' },
    { title: 'Technicien AQ' },
  ]

  it('garde les offres du métier de l’ESN et range les autres à part', () => {
    const { inTrade, offTrade } = splitJobsByTrade(jobs, profile)
    expect(inTrade.map(job => job.title)).toEqual(['Développeur Java confirmé'])
    expect(offTrade.map(job => job.title)).toEqual(['Auditeur interne', 'Acheteur projets', 'Technicien AQ'])
  })

  it('sans profil lu, rien n’est deviné hors métier (sauf un poste que nulle ESN ne place)', () => {
    const { inTrade, offTrade } = splitJobsByTrade([{ title: 'Auditeur interne' }, { title: 'Facteur' }], undefined)
    expect(inTrade.map(job => job.title)).toEqual(['Auditeur interne'])
    expect(offTrade.map(job => job.title)).toEqual(['Facteur'])
  })

  it('tout est dans le métier : rien n’est rangé à part', () => {
    expect(splitJobsByTrade([{ title: 'Data engineer' }], profile).offTrade).toEqual([])
  })
})
