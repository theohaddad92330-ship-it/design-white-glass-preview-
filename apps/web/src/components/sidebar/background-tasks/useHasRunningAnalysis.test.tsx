import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { DisplayTask } from './types'
import { hasRunningAnalysis, useHasRunningAnalysis } from './useHasRunningAnalysis'

function makeEntry(overrides: Partial<DisplayTask>): DisplayTask {
  return {
    key: 'entry-1',
    title: 'Entry',
    label: 'Entry',
    loaderVariant: 'grid-orbit',
    status: 'completed',
    sourceId: 'source-1',
    source: 'task',
    startedAt: Date.now(),
    ...overrides,
  }
}

function Probe({ entries }: { entries: DisplayTask[] }) {
  const result = useHasRunningAnalysis(entries)
  return <span data-testid="value">{result ? 'true' : 'false'}</span>
}

describe('hasRunningAnalysis', () => {
  it('returns true when at least one analysis entry is running', () => {
    const entries: DisplayTask[] = [
      makeEntry({ key: 'task-running', source: 'task', status: 'running' }),
      makeEntry({ key: 'analysis-running', source: 'analysis', status: 'running' }),
    ]

    expect(hasRunningAnalysis(entries)).toBe(true)
  })

  it('returns false when only task entries are running', () => {
    const entries: DisplayTask[] = [makeEntry({ source: 'task', status: 'running' })]

    expect(hasRunningAnalysis(entries)).toBe(false)
  })

  it('returns false when analysis entries are only COMPLETED — rien à signaler', () => {
    const entries: DisplayTask[] = [makeEntry({ source: 'analysis', status: 'completed' })]

    expect(hasRunningAnalysis(entries)).toBe(false)
  })

  /**
   * #2729 — la pastille existe pour ANNONCER une analyse, pas seulement pour
   * en montrer le déroulé. `BackgroundTasksPill` sait déjà rendre un état
   * « Échec » (icône `AlertCircle`, bordure rouge, `tasks.status.error`) —
   * mais ce garde-barrière l'empêchait de jamais l'atteindre : une analyse qui
   * passe de « running » à « error » faisait disparaître la pastille au moment
   * précis où l'utilisateur avait besoin de la voir. Mesuré le 22/09/2026 :
   * c'est le trou que #2729 nomme pour /chat (« une analyse bloquée n'est
   * annoncée que sur la fiche du compte »).
   */
  it('#2729 — returns true when an analysis a ÉCHOUÉ, même sans rien de running', () => {
    const entries: DisplayTask[] = [makeEntry({ source: 'analysis', status: 'error' })]

    expect(hasRunningAnalysis(entries)).toBe(true)
  })

  it('#2729 — un TASK en échec (import, sauvegarde) ne fait PAS apparaître la pastille — périmètre limité à l’analyse', () => {
    const entries: DisplayTask[] = [makeEntry({ source: 'task', status: 'error' })]

    expect(hasRunningAnalysis(entries)).toBe(false)
  })
})

describe('useHasRunningAnalysis', () => {
  it('exposes the same predicate result through the hook', () => {
    const entries: DisplayTask[] = [makeEntry({ source: 'analysis', status: 'running' })]

    render(<Probe entries={entries} />)

    expect(screen.getByTestId('value').textContent).toBe('true')
  })
})
