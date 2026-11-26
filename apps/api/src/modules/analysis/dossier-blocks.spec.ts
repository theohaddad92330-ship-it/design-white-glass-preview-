import { supplierNamesIn, type KeyNote } from '@bellum/contracts'
import {
  computeDataReliabilityNotes,
  computeFinancialIndicators,
  DOSSIER_BLOCK_KEYS,
  dossierBlockKeysToRefresh,
  sanitizeSynthesisNotes,
} from './dossier-blocks'

/**
 * #4078 — parité démo : les producteurs RÉELS des blocs 16 (indicateurs
 * financiers) et 17 (fiabilité), calculés sans modèle depuis ce que l'analyse a
 * DÉJÀ collecté, et le filtre des blocs 01/14/15 rendus par le modèle.
 * Chacun sait dire NON : sans matière, aucune ligne ; jamais un fournisseur nommé.
 */

const NOW = new Date('2026-10-12T00:00:00Z')

const textOf = (notes: KeyNote[]): string =>
  notes.map(n => [n.label, n.constat, n.interpretation, n.implication, n.reliability].join(' ')).join(' ')

describe('computeFinancialIndicators (bloc 16)', () => {
  const history = [
    { year: 2022, revenue: 100_000_000, net_result: 5_000_000, headcount: 500 },
    { year: 2024, revenue: 120_000_000, net_result: 9_000_000, headcount: 600 },
    { year: 2023, revenue: null, net_result: null, headcount: null },
  ]

  it('dérive des comptes publiés des indicateurs qui ne répètent pas l’historique', () => {
    const notes = computeFinancialIndicators({ financials_history: history })
    const labels = notes.map(n => n.label)
    expect(labels).toEqual([
      'Évolution du chiffre d’affaires',
      'Marge nette',
      'Chiffre d’affaires par salarié',
      'Évolution des effectifs',
    ])
    expect(notes[0]).toMatchObject({ amount: null, currency: null, period: '2022–2024' })
    expect(notes[0]?.constat).toContain('+20 %')
    expect(notes[1]).toMatchObject({ amount: null, period: '2024' })
    expect(notes[1]?.constat).toContain('7,5 %')
    expect(notes[2]).toMatchObject({ amount: 200_000, currency: 'EUR', period: '2024' })
    expect(notes[3]?.constat).toContain('+20 %')
  })

  it('dit NON sans comptes : aucune ligne, jamais un 0', () => {
    expect(computeFinancialIndicators({})).toEqual([])
    expect(computeFinancialIndicators({ financials_history: [] })).toEqual([])
    expect(
      computeFinancialIndicators({
        financials_history: [{ year: 2024, revenue: null, net_result: null, headcount: null }],
      }),
    ).toEqual([])
  })

  it('dit NON à un ratio sans dénominateur : CA nul ou effectif nul ne font pas de ligne', () => {
    const notes = computeFinancialIndicators({
      financials_history: [{ year: 2024, revenue: 0, net_result: -1_000, headcount: 0 }],
    })
    expect(notes).toEqual([])
  })

  // #recette-21-10-K1 — Thales : comptes sociaux d'une holding (résultat 1,3 Md € > CA 248 M €).
  it('ne calcule aucune marge nette quand le résultat dépasse le CA (holding), jamais > 100 %', () => {
    const notes = computeFinancialIndicators({
      financials_history: [
        { year: 2023, revenue: 200_000_000, net_result: 50_000_000, headcount: null },
        { year: 2024, revenue: 248_400_000, net_result: 1_300_000_000, headcount: null },
      ],
    })
    expect(notes.map(n => n.label)).not.toContain('Marge nette')
    expect(textOf(notes)).not.toMatch(/\b(1\d{2}|[2-9]\d{2}|\d{4,}),?\d* %/)
  })

  it('ne nomme aucune source par son outil', () => {
    const notes = computeFinancialIndicators({ financials_history: history })
    expect(supplierNamesIn(textOf(notes))).toEqual([])
  })
})

describe('computeDataReliabilityNotes (bloc 17)', () => {
  it('nomme des comptes anciens, une entité retenue sans confirmation et des signaux incomplets', () => {
    const notes = computeDataReliabilityNotes(
      {
        legal_form: 'SA',
        financials_history: [{ year: 2021, revenue: 10, net_result: 1, headcount: 2 }],
        homonyms: { status: 'selected', selectedSiren: '123456789' },
        signal_coverage: { status: 'incomplete', unreachable: [{ source: 'brave_news' }] },
        recent_signals: [{ signal: 'Levée', date: '2024-01-15' }],
      },
      NOW,
    )
    expect(notes.map(n => n.label)).toEqual([
      'Comptes anciens',
      'Entité retenue sans confirmation',
      'Recherche de signaux incomplète',
      'Signaux anciens',
    ])
    expect(notes[0]?.constat).toContain('2021')
    expect(supplierNamesIn(textOf(notes))).toEqual([])
    expect(textOf(notes)).not.toContain('brave')
  })

  it('nomme l’absence de comptes publiés quand l’identité au registre est connue', () => {
    const notes = computeDataReliabilityNotes({ legal_form: 'SAS' }, NOW)
    expect(notes.map(n => n.label)).toEqual(['Comptes non publiés'])
  })

  it('dit NON sans matière : un dossier vide ne fait aucune ligne', () => {
    expect(computeDataReliabilityNotes({}, NOW)).toEqual([])
  })

  it('dit NON sur un dossier sain : comptes récents, entité unique, signaux récents', () => {
    const notes = computeDataReliabilityNotes(
      {
        legal_form: 'SA',
        financials_history: [{ year: 2025, revenue: 10, net_result: 1, headcount: 2 }],
        homonyms: { status: 'unique' },
        signal_coverage: { status: 'found' },
        recent_signals: [{ signal: 'Levée', date: '2026-09-01' }],
      },
      NOW,
    )
    expect(notes).toEqual([])
  })
})

describe('sanitizeSynthesisNotes (blocs 01/14/15)', () => {
  const note = (over: Partial<KeyNote>): Record<string, unknown> => ({
    label: 'Organisation par métiers',
    constat: 'Trois pôles déclarés au registre.',
    interpretation: null,
    implication: null,
    reliability: 'registre — établi',
    amount: null,
    currency: null,
    period: null,
    ...over,
  })

  it('garde la forme keyNoteSchema exacte', () => {
    expect(sanitizeSynthesisNotes([note({})])).toEqual([note({})])
  })

  it('dit NON à une note qui nomme un fournisseur, sans libellé, ou hors forme', () => {
    expect(
      sanitizeSynthesisNotes([
        note({ reliability: 'Pappers — établi' }),
        note({ constat: 'vu via apollo_enrich' }),
        note({ label: null }),
        'pas une note',
      ]),
    ).toEqual([])
    expect(sanitizeSynthesisNotes(undefined)).toEqual([])
  })

  it('ne laisse jamais un chiffre au modèle', () => {
    expect(sanitizeSynthesisNotes([note({ amount: 12, currency: 'EUR', period: '2024' })])).toEqual([note({})])
  })
})

describe('dossierBlockKeysToRefresh', () => {
  it('rend les cinq clés, déjà posées ou non — une ré-analyse rafraîchit (#4078, Louis 15/10)', () => {
    expect(dossierBlockKeysToRefresh({ financial_indicators: [], opportunity_domains: [{ label: 'x' }] })).toEqual([
      ...DOSSIER_BLOCK_KEYS,
    ])
  })

  it('sait dire NON : une clé corrigée à la main n’est jamais rafraîchie (la correction gagne)', () => {
    expect(dossierBlockKeysToRefresh({ human_corrected_blocks: ['opportunity_domains', 'inconnue', 42] })).toEqual(
      DOSSIER_BLOCK_KEYS.filter(k => k !== 'opportunity_domains'),
    )
  })
})
