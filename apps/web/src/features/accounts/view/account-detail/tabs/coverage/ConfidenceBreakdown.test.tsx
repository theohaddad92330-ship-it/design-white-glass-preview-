import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { CoverageGapsResponse } from '@bellum/contracts'
import { ConfidenceBreakdown } from './ConfidenceBreakdown'

/**
 * #2307.2/#2307.7 — les diagnostics « scope résolu » et « personnes vérifiées »
 * se montrent ENSEMBLE, hors moyenne, jamais un 0 inventé quand l'un des deux
 * est absent du payload (réponse mise en cache avant son ajout).
 */

type Confidence = NonNullable<CoverageGapsResponse['confidence']>

const BASE: Confidence = {
  score: 80,
  identity: 100,
  freshness: 80,
  coverage: 70,
  sources: 90,
  consistency: 60,
}

afterEach(cleanup)

describe('ConfidenceBreakdown — diagnostics scope résolu / personnes vérifiées', () => {
  it('affiche les deux diagnostics quand les deux sont présents', () => {
    render(<ConfidenceBreakdown confidence={{ ...BASE, verified: 50, scope: 100 }} />)
    expect(screen.getByText('Personnes vérifiées')).toBeTruthy()
    expect(screen.getByText('Scope résolu')).toBeTruthy()
  })

  it('n’affiche PAS « scope résolu » quand il est absent — jamais un 0 inventé', () => {
    render(<ConfidenceBreakdown confidence={{ ...BASE, verified: 50 }} />)
    expect(screen.getByText('Personnes vérifiées')).toBeTruthy()
    expect(screen.queryByText('Scope résolu')).toBeNull()
  })

  it('affiche « scope résolu » seul quand `verified` est absent', () => {
    render(<ConfidenceBreakdown confidence={{ ...BASE, scope: 0 }} />)
    expect(screen.getByText('Scope résolu')).toBeTruthy()
    expect(screen.queryByText('Personnes vérifiées')).toBeNull()
  })

  it('n’affiche aucun bloc diagnostic quand les deux sont absents', () => {
    render(<ConfidenceBreakdown confidence={BASE} />)
    expect(screen.queryByText('Personnes vérifiées')).toBeNull()
    expect(screen.queryByText('Scope résolu')).toBeNull()
  })
})
