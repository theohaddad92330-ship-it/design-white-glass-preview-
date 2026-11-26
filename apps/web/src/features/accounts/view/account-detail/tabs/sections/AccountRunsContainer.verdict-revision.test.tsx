import { screen } from '@testing-library/react'
import { vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'

/**
 * #3212.4/.6 (épopée #3235) — « ancien verdict → nouveau verdict, cause, date »
 * doit ARRIVER À L'ÉCRAN, pas seulement exister côté API
 * (`AnalysisRunsService.explainVerdictChange`). Fichier séparé des deux
 * autres suites d'`AccountRunsContainer` : le mock hissé de
 * `useAccountVerdictRevision` remplacerait sinon leur comportement désactivé
 * (sans session).
 */
vi.mock('@/features/profile/hooks/useEsnProfile', () => ({ useHasOfferObjective: () => true }))
vi.mock('@/features/accounts/hooks/useAccountRuns', () => ({
  useAccountRuns: () => ({ data: [], isLoading: false }),
}))

describe('AccountRunsContainer — #3212.4/.6, la révision de verdict arrive à l’écran', () => {
  it('nomme l’ancien verdict, le nouveau, la date et les causes quand une révision existe', async () => {
    vi.doMock('@/features/accounts/hooks/useAccountVerdictRevision', () => ({
      useAccountVerdictRevision: () => ({
        data: {
          previousVerdict: 'NO-GO',
          newVerdict: 'GO',
          changedAt: '2026-09-28T08:00:00Z',
          causes: ['nouveaux facteurs dominants : sponsor'],
        },
      }),
    }))
    const { AccountRunsContainer: Container } = await import('./AccountRunsContainer')
    renderWithRouter(<Container accountId="a-9" />)

    const revision = await screen.findByTestId('verdict-revision')
    // #3235 — le vocabulaire de la Synthèse : GO → AGIR MAINTENANT, NO-GO sans déclencheur → ÉCARTER.
    expect(revision).toHaveTextContent('ÉCARTER POUR CET OBJECTIF')
    expect(revision).toHaveTextContent('AGIR MAINTENANT')
    expect(revision).toHaveTextContent('sponsor')
    vi.doUnmock('@/features/accounts/hooks/useAccountVerdictRevision')
  })

  it('n’affiche rien quand il n’y a rien à expliquer (`null`)', async () => {
    vi.doMock('@/features/accounts/hooks/useAccountVerdictRevision', () => ({
      useAccountVerdictRevision: () => ({ data: null }),
    }))
    const { AccountRunsContainer: Container } = await import('./AccountRunsContainer')
    renderWithRouter(<Container accountId="a-9" />)

    expect(screen.queryByTestId('verdict-revision')).not.toBeInTheDocument()
    vi.doUnmock('@/features/accounts/hooks/useAccountVerdictRevision')
  })
})
