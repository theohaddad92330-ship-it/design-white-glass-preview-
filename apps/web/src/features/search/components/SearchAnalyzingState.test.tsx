/**
 * #2164.16 (épopée #2937, /search — Analyser) — CONSULTER LES RÉSULTATS
 * INTERMÉDIAIRES EN COURS.
 *
 * Trois vérifications successives (25/09, nuit 25, lot g14 du 26/09) ont classé
 * ce point « reste », chacune sur la même preuve : `SearchAnalyzingState.tsx` ne
 * reçoit que `phase`/`percent` comme props. C'est vrai, et ça ne suffisait pas à
 * conclure — cette preuve ne regardait que les PROPS de ce composant, jamais ce
 * que `AnalysisProgressCard` (qu'il monte, avec le même `accountId`) lit de son
 * côté : `useAnalysisRun(accountId)`, qui porte déjà `partials` depuis #2630.2
 * (`phase:complete` → `analysisPartialFrom` côté serveur → `addPartial` côté
 * client, `analysis-subscription.ts` — LE MÊME abonnement que `useAnalysis`
 * (Search) et `useAnalysisProgress` (AccountDetail) partagent, par construction
 * du fichier).
 *
 * Ce test verrouille la conclusion CORRIGÉE : le point est déjà livré, via
 * l'appelant qu'aucune des trois vérifications précédentes n'avait remonté.
 */
import { render, screen } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { SearchAnalyzingState } from './SearchAnalyzingState'

const mockUseAnalysisRun = vi.fn()

vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: (_target: unknown, prop: string) => {
        const Rendered = ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) =>
          createElement(typeof prop === 'string' ? prop : 'div', props, children)
        return Rendered
      },
    },
  ),
  AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
}))

vi.mock('@/stores/analysisStore', () => ({
  STEP_KEYS: ['scope', 'crosscheck', 'account_sheet', 'decision_makers', 'orga_chain', 'classification', 'messages'],
  useAnalysisRun: (...args: unknown[]) => mockUseAnalysisRun(...args),
}))

describe('SearchAnalyzingState — les résultats intermédiaires du run atteignent l’écran (#2164.16)', () => {
  it('un partiel déjà reçu par le run se lit sur l’écran d’analyse de /search', () => {
    mockUseAnalysisRun.mockReturnValue({
      phase: 'Identification des décideurs',
      percent: 55,
      completedSteps: [],
      currentStep: null,
      warnings: [],
      sourceHealth: {},
      events: [],
      partials: [{ phase: 'contacts', at: Date.now(), findings: [{ kind: 'contacts', count: 4, samples: [] }] }],
    })

    render(<SearchAnalyzingState companyName="Acme" phase="En cours" accountId="acc-1" onCancel={() => {}} />)

    // La preuve que l'écran de /search — pas seulement AnalysisProgressCard
    // isolément — lit bien le run partagé par son accountId.
    expect(mockUseAnalysisRun).toHaveBeenCalledWith('acc-1')
    expect(screen.getByTestId('analysis-partials')).toBeInTheDocument()
  })

  it('aucun accountId (relance pas encore résolue) : aucun bloc de résultats intermédiaires — jamais une absence affichée', () => {
    mockUseAnalysisRun.mockReturnValue(null)

    render(<SearchAnalyzingState companyName="Acme" phase="En cours" accountId={null} onCancel={() => {}} />)

    expect(screen.queryByTestId('analysis-partials')).not.toBeInTheDocument()
  })
})
