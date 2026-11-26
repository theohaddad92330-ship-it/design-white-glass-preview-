import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnalysisRun, AnalysisVersioning } from '@bellum/contracts'
import { formatRunDate, runStatusView, scopeModeLabel, toAnalysisRunView, versioningLines } from './analysisRuns'

function makeRun(over: Partial<AnalysisRun> = {}): AnalysisRun {
  return {
    id: 'run-1',
    account_id: 'acc-1',
    status: 'completed',
    scope_mode: 'france',
    siren: '552081317',
    cost_eur: '0.4200',
    created_at: '2026-07-14T09:05:00Z',
    completed_at: '2026-07-14T09:11:00Z',
    ...over,
  }
}

describe('runStatusView', () => {
  it('maps each known status to a label + tone', () => {
    expect(runStatusView('analyzing')).toEqual({ label: 'En cours', tone: 'info' })
    expect(runStatusView('completed')).toEqual({ label: 'Terminée', tone: 'success' })
    expect(runStatusView('error')).toEqual({ label: 'Échec', tone: 'danger' })
    expect(runStatusView('canceled')).toEqual({ label: 'Annulée', tone: 'neutral' })
  })

  it('falls back to the raw status with a neutral tone for an unknown value', () => {
    expect(runStatusView('weird')).toEqual({ label: 'weird', tone: 'neutral' })
  })
})

describe('scopeModeLabel', () => {
  it('uses the canonical perimeter label for a known scope', () => {
    expect(scopeModeLabel('france')).toBe('France')
    expect(scopeModeLabel('groupe')).toBe('Groupe entier')
    expect(scopeModeLabel('it_digital')).toBe('IT & Digital')
  })

  it('labels a missing scope as the default perimeter', () => {
    expect(scopeModeLabel(null)).toBe('Périmètre par défaut')
    expect(scopeModeLabel(undefined)).toBe('Périmètre par défaut')
  })

  it('passes an unknown scope through unchanged', () => {
    expect(scopeModeLabel('mystery')).toBe('mystery')
  })
})

describe('formatRunDate', () => {
  // #2915.3 — la date ET l'heure LOCALE (fuseau de la suite : Europe/Paris, UTC+1 le 31/10/2026), via `formatDate`.
  afterEach(() => vi.useRealTimers())

  it('lit date et heure locales de l’année en cours, sans l’année', () => {
    vi.useFakeTimers({ now: new Date('2026-11-02T10:00:00Z') })
    expect(formatRunDate('2026-10-31T13:05:00Z')).toBe('31/10 à 14:05')
  })

  it('ajoute l’année quand l’analyse n’est pas de l’année en cours', () => {
    vi.useFakeTimers({ now: new Date('2026-11-02T10:00:00Z') })
    expect(formatRunDate('2025-01-03T04:07:00Z')).toBe('03/01/2025 à 05:07')
  })

  it('ne rend jamais « Invalid Date » : une date absente ou illisible vaut un tiret', () => {
    expect(formatRunDate(null)).toBe('—')
    expect(formatRunDate(undefined)).toBe('—')
    expect(formatRunDate('not-a-date')).toBe('—')
  })
})

describe('toAnalysisRunView', () => {
  // L'année n'est écrite que hors année en cours : l'horloge est figée pour que le libellé ne dépende pas du jour.
  beforeEach(() => vi.useFakeTimers({ now: new Date('2026-11-02T10:00:00Z') }))
  afterEach(() => vi.useRealTimers())

  it('projects a run to the compact history-row view (anchored on the launch date)', () => {
    const view = toAnalysisRunView(makeRun())
    expect(view).toEqual({
      id: 'run-1',
      dateLabel: '14/07 à 11:05',
      statusLabel: 'Terminée',
      statusTone: 'success',
      scopeLabel: 'France',
      // Un run d'avant les paliers = « Vérifiée », 12 pages (la profondeur d'origine).
      depthLabel: 'Vérifiée · 12 pages lues',
    })
  })

  // #3288 (recette Y7 02/10) — `scope_selection.depth=deep` et les 15 pages n'étaient lisibles nulle part.
  it('#3288 — rend la profondeur choisie et ses pages, lues de scope_selection', () => {
    expect(toAnalysisRunView(makeRun({ scope_selection: { depth: 'deep' } })).depthLabel).toBe(
      'Approfondie · 15 pages lues',
    )
    expect(toAnalysisRunView(makeRun({ scope_selection: { depth: 'quick' } })).depthLabel).toBe('Rapide · 6 pages lues')
    expect(toAnalysisRunView(makeRun({ scope_selection: null })).depthLabel).toBe('Vérifiée · 12 pages lues')
  })

  it('handles an in-progress run with no scope + no completion time', () => {
    const view = toAnalysisRunView(
      makeRun({ status: 'analyzing', scope_mode: null, completed_at: null, created_at: '2026-07-15T22:30:00Z' }),
    )
    expect(view.statusLabel).toBe('En cours')
    expect(view.statusTone).toBe('info')
    expect(view.scopeLabel).toBe('Périmètre par défaut')
    expect(view.dateLabel).toBe('16/07 à 00:30')
  })
})

// #2318.5 — LAU-FINAL-059, VERSIONING : les sept identifiants qui manquaient
// à l'écran (date/scope sont déjà dans `toAnalysisRunView`).
describe('versioningLines', () => {
  function versioning(over: Partial<AnalysisVersioning> = {}): AnalysisVersioning {
    return {
      analysis_version: null,
      profile_version: null,
      account_context_version: null,
      dataforge_version: null,
      market_memory_version: null,
      prompt_version: null,
      scoring_version: null,
      date: '2026-07-14T09:05:00Z',
      scope: 'france',
      ...over,
    }
  }

  it('rend [] quand le run ne porte aucun versioning (chemin qui ne l’attache pas)', () => {
    expect(versioningLines(undefined)).toEqual([])
  })

  it('nomme les identifiants, un par ligne — la version mémoire marché seulement quand elle a été lue', () => {
    const lines = versioningLines(versioning({ market_memory_version: '2026-09-v3' }))
    expect(lines.map(l => l.key)).toEqual([
      'analysis_version',
      'profile_version',
      'prompt_version',
      'account_context_version',
      'dataforge_version',
      'market_memory_version',
      'scoring_version',
    ])
  })

  // #3235 (recette prod 02/10) — un run sans version de mémoire marché (compte
  // non couvert, ou plan qui ne l'a pas lue) le DIT : état nommé, ni « non mesuré » ni ligne absente.
  it('un run sans consultation de la mémoire marché le dit en clair', () => {
    const line = versioningLines(versioning()).find(l => l.key === 'market_memory_version')
    expect(line?.value).toMatch(/non consultée/)
    expect(line?.value).not.toBe('non mesuré')
  })

  it('un identifiant INCONNU se dit « non mesuré », jamais un zéro ou une ligne absente (GA-18/19)', () => {
    const lines = versioningLines(versioning())
    expect(lines.length).toBeGreaterThan(0)
    expect(lines.filter(l => l.key !== 'market_memory_version').every(l => l.value === 'non mesuré')).toBe(true)
  })

  it('un identifiant SOURCÉ rend sa vraie valeur', () => {
    const lines = versioningLines(versioning({ profile_version: 'esn:3/context:7', scoring_version: 'v2' }))
    expect(lines.find(l => l.key === 'profile_version')?.value).toBe('esn:3/context:7')
    expect(lines.find(l => l.key === 'scoring_version')?.value).toBe('v2')
  })

  it('prompt_version compte ses PHASES plutôt que de rendre l’objet brut', () => {
    const lines = versioningLines(versioning({ prompt_version: { phase1: 'a', phase2: 'b' } }))
    expect(lines.find(l => l.key === 'prompt_version')?.value).toBe('2 phases capturées')
  })
})
