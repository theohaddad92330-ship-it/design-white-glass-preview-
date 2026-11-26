import { describe, expect, it } from 'vitest'
import type { AccountAnalysis } from '@bellum/contracts'
import { buildAccountProvenance } from './accountProvenance'

const base = {} as AccountAnalysis
const NOW = Date.UTC(2026, 6, 23) // 2026-07-23

function build(overrides: Partial<Parameters<typeof buildAccountProvenance>[0]> = {}) {
  return buildAccountProvenance({
    lastAnalyzedAt: null,
    reliability: null,
    tier: null,
    analysis: base,
    nowMs: NOW,
    ...overrides,
  })
}

describe('buildAccountProvenance — global freshness', () => {
  it('derives whole-day age from last_analyzed_at (p14 "fraîcheur globale")', () => {
    const p = build({ lastAnalyzedAt: '2026-07-13T09:00:00.000Z' })
    expect(p.lastAnalyzedAt).toBe('2026-07-13T09:00:00.000Z')
    expect(p.ageDays).toBe(9) // 9 d 15 h → floored to whole days
  })

  it('leaves age null when the dossier was never analysed — never guesses a date', () => {
    const p = build({ lastAnalyzedAt: null })
    expect(p.lastAnalyzedAt).toBeNull()
    expect(p.ageDays).toBeNull()
  })

  it('carries reliability + tier through untouched', () => {
    const p = build({ reliability: 72, tier: 'high' })
    expect(p.reliability).toBe(72)
    expect(p.tier).toBe('high')
  })
})

describe('buildAccountProvenance — structured provider sources (present-only)', () => {
  it('lists Apollo when the firmographics block is present', () => {
    const p = build({ apolloEnrichment: { estimatedNumEmployees: 3100 } })
    const apollo = p.sources.find(s => s.providerKey === 'apollo')
    expect(apollo).toBeDefined()
    expect(apollo?.feeds).toEqual(['firmographics'])
  })

  it('does not list Apollo for an empty / absent enrichment block', () => {
    expect(build({ apolloEnrichment: {} }).sources.find(s => s.providerKey === 'apollo')).toBeUndefined()
    expect(build({ apolloEnrichment: null }).sources.find(s => s.providerKey === 'apollo')).toBeUndefined()
  })

  it('lists Pappers with the freshest financial year as its date', () => {
    const analysis = {
      financials_history: [{ year: 2022 }, { year: 2024 }, { year: 2023 }],
      legal_form: 'SA',
    } as unknown as AccountAnalysis
    const p = build({ analysis })
    const pappers = p.sources.find(s => s.providerKey === 'pappers')
    expect(pappers?.feeds).toContain('financials')
    expect(pappers?.latestDate).toBe('2024')
  })

  it('adds the leadership feed to Pappers when officers / owners are present', () => {
    const analysis = {
      pappers_url: 'https://pappers.fr/entreprise/x',
      beneficial_owners: [{ name: 'Jane Doe' }],
    } as unknown as AccountAnalysis
    const pappers = build({ analysis }).sources.find(s => s.providerKey === 'pappers')
    expect(pappers?.feeds).toContain('leadership')
  })

  it('lists BOAMP/DECP for tenders with the freshest tender date', () => {
    const analysis = {
      public_tenders: [{ title: 'Infra', published_date: '2026-05-01' }],
      awarded_contracts: [{ title: 'Cloud', notified_date: '2026-06-20', winner: 'X' }],
    } as unknown as AccountAnalysis
    const pm = build({ analysis }).sources.find(s => s.providerKey === 'publicMarkets')
    expect(pm?.feeds).toEqual(['tenders'])
    expect(pm?.latestDate).toBe('2026-06-20')
  })

  it('lists employment jobs and GitHub with their own dates', () => {
    const analysis = {
      it_job_signals: [{ title: 'Data Engineer', date: '2026-07-01' }],
      github_signals: { org: 'tf1', last_activity: '2026-06-15' },
    } as unknown as AccountAnalysis
    const sources = build({ analysis }).sources
    expect(sources.find(s => s.providerKey === 'employment')?.latestDate).toBe('2026-07-01')
    expect(sources.find(s => s.providerKey === 'github')?.latestDate).toBe('2026-06-15')
  })
})

describe('buildAccountProvenance — signal sources (p14: Brave, France Travail traceable)', () => {
  it('merges a named signal source into its canonical provider instead of duplicating it', () => {
    const analysis = {
      it_job_signals: [{ title: 'Dev', date: '2026-01-01' }],
      recent_signals: [{ signal: 'Recrutement', source: 'France Travail', date: '2026-07-10' }],
    } as unknown as AccountAnalysis
    const sources = build({ analysis }).sources
    const employment = sources.filter(s => s.providerKey === 'employment')
    expect(employment).toHaveLength(1)
    expect(employment[0]?.feeds).toEqual(['jobs', 'signals'])
    // freshest of the job (Jan) and the signal (Jul)
    expect(employment[0]?.latestDate).toBe('2026-07-10')
  })

  it('keeps a non-canonical signal source as its own row, deduped by name', () => {
    // p14 voulait « Brave » visible pour rester traçable ; §55 tranche l'inverse
    // sur le NOM (le client achète BellumAI, pas une addition d'APIs) sans rien
    // retirer à la traçabilité : la ligne existe toujours, avec sa fraîcheur,
    // sous la capacité que l'outil représente.
    const analysis = {
      recent_signals: [
        { signal: 'a', source: 'Brave News', date: '2026-07-01' },
        { signal: 'b', source: 'Brave News', date: '2026-07-15' },
      ],
    } as unknown as AccountAnalysis
    const brave = build({ analysis }).sources.filter(s => s.rawLabel === 'Recherche web')
    expect(brave).toHaveLength(1)
    expect(brave[0]?.providerKey).toBeNull()
    expect(brave[0]?.feeds).toEqual(['signals'])
    expect(brave[0]?.latestDate).toBe('2026-07-15')
  })

  it('buckets a signal with no source under a single "unknown" row — never invents a provenance', () => {
    const analysis = {
      recent_signals: [
        { signal: 'a', source: null, date: '2026-07-01' },
        { signal: 'b', source: '  ', date: '2026-07-02' },
      ],
    } as unknown as AccountAnalysis
    const unknown = build({ analysis }).sources.filter(s => s.providerKey === null && s.rawLabel === null)
    expect(unknown).toHaveLength(1)
    expect(unknown[0]?.key).toBe('unknown')
    expect(unknown[0]?.latestDate).toBe('2026-07-02')
  })
})

describe('buildAccountProvenance — ordering & emptiness', () => {
  it('returns no sources when nothing was collected', () => {
    expect(build().sources).toEqual([])
  })

  it('orders canonical providers first, unknown last', () => {
    const analysis = {
      apollo: undefined,
      recent_signals: [
        { signal: 'x', source: null, date: '2026-07-02' },
        { signal: 'y', source: 'Brave', date: '2026-07-05' },
      ],
      it_job_signals: [{ title: 'Dev', date: '2026-07-01' }],
    } as unknown as AccountAnalysis
    const keys = build({ analysis }).sources.map(s => s.providerKey ?? s.rawLabel ?? 'unknown')
    expect(keys[0]).toBe('employment') // canonical first
    expect(keys[keys.length - 1]).toBe('unknown') // unknown last
  })
})

describe('masquage des fournisseurs dans la vue métier (§55)', () => {
  it('remplace un nom d’outil de collecte par la capacité qu’il représente', () => {
    const analysis = {
      recent_signals: [
        { signal: 'a', source: 'Firecrawl — page carrières', date: '2026-07-01' },
        { signal: 'b', source: 'Brave Search', date: '2026-07-02' },
      ],
    } as unknown as AccountAnalysis
    const labels = build({ analysis }).sources.map(s => s.rawLabel)
    expect(labels).toContain('Site de l’entreprise')
    expect(labels).toContain('Recherche web')
    expect(labels.join(' ')).not.toMatch(/firecrawl|brave/i)
  })

  it('laisse intact un titre de presse — c’est une preuve, pas un fournisseur', () => {
    const analysis = {
      recent_signals: [{ signal: 'a', source: 'Les Échos', date: '2026-07-03' }],
    } as unknown as AccountAnalysis
    expect(build({ analysis }).sources.map(s => s.rawLabel)).toContain('Les Échos')
  })
})
