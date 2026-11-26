import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const cockpit = vi.fn()
vi.mock('@/features/dashboard/hooks/usePersonalCockpit', () => ({ usePersonalCockpit: () => cockpit() }))
vi.mock('@/features/dashboard/components/perspective/PortfolioCoverageCard', () => ({
  PortfolioCoverageCard: ({ coverage }: { coverage: { without_next_action: number } }) => (
    <div data-testid="portfolio-coverage">{coverage.without_next_action}</div>
  ),
}))

const { CockpitCoverage } = await import('./CockpitCoverage')

/** #2114.60 / .64 — la couverture du portefeuille est ATTEIGNABLE depuis Pilotage › Cockpit. */
describe('CockpitCoverage', () => {
  beforeEach(() => cockpit.mockReset())

  it('monte la carte de couverture quand la perspective la porte', () => {
    cockpit.mockReturnValue({
      error: false,
      loading: false,
      data: { perspective: { coverage: { without_next_action: 4 } } },
    })
    render(<CockpitCoverage />)
    expect(screen.getByTestId('portfolio-coverage').textContent).toBe('4')
  })

  it('NON : sans perspective (API plus ancienne) ou en erreur, rien — jamais des zéros', () => {
    cockpit.mockReturnValue({ error: false, loading: false, data: {} })
    const first = render(<CockpitCoverage />)
    expect(first.container.innerHTML).toBe('')
    first.unmount()
    cockpit.mockReturnValue({ error: true, loading: false, data: { perspective: { coverage: {} } } })
    const second = render(<CockpitCoverage />)
    expect(second.container.innerHTML).toBe('')
  })
})
