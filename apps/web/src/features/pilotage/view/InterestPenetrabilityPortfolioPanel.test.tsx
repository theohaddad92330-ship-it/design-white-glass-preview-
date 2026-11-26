import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { AccountInterestPenetrabilityPortfolio } from '@bellum/contracts'

const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u-1' } }) }))

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params,
    ...rest
  }: { children: React.ReactNode; to: string; params?: Record<string, string> } & Record<string, unknown>) => {
    const href = params ? Object.entries(params).reduce((path, [key, value]) => path.replace(`$${key}`, value), to) : to
    return (
      <a href={href} {...(rest as Record<string, string>)}>
        {children}
      </a>
    )
  },
}))

import { InterestPenetrabilityPortfolioPanel } from './InterestPenetrabilityPortfolioPanel'

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function portfolio(over: Partial<AccountInterestPenetrabilityPortfolio> = {}): AccountInterestPenetrabilityPortfolio {
  return { entries: [], totalAccounts: 0, truncated: false, ...over }
}

/**
 * #3258.13 (épopée #3362, lot P01) — LE PANNEAU PORTEFEUILLE sur Pilotage.
 *
 * `deriveAccountInterestPenetrability` reste la seule fonction qui tranche un
 * quadrant (GA-26) : ce panneau ne fait que RENDRE ce que la route
 * `interest-penetrability-portfolio` a déjà compté.
 */
describe('InterestPenetrabilityPortfolioPanel', () => {
  it('se tait quand la façade est indisponible (`@Optional()` non montée)', async () => {
    apiFetch.mockResolvedValueOnce({ status: 'unavailable' })
    const { container } = render(<InterestPenetrabilityPortfolioPanel />, { wrapper })
    await waitFor(() => expect(apiFetch).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('dit "aucun compte" quand le portefeuille est vide — jamais quatre quadrants à zéro affichés comme une liste', async () => {
    apiFetch.mockResolvedValueOnce(portfolio())
    render(<InterestPenetrabilityPortfolioPanel />, { wrapper })
    await waitFor(() => expect(screen.getByText(/aucun compte/i)).toBeInTheDocument())
  })

  it('affiche le nombre réel de comptes par quadrant et lie les comptes nommés', async () => {
    apiFetch.mockResolvedValueOnce(
      portfolio({
        totalAccounts: 2,
        entries: [
          { accountId: 'a1', companyName: 'Alpha', quadrant: 'priority_now', quadrantUnavailableReason: null },
          { accountId: 'a2', companyName: 'Beta', quadrant: 'priority_now', quadrantUnavailableReason: null },
        ],
      }),
    )
    render(<InterestPenetrabilityPortfolioPanel />, { wrapper })
    await waitFor(() => expect(screen.getByText('Priorité immédiate')).toBeInTheDocument())
    expect(screen.getByText('2 comptes')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Alpha' })
    expect(link).toHaveAttribute('href', '/accounts/a1')
  })

  it("nomme séparément les comptes dont la position n'est pas déterminée — jamais fondus dans un quadrant", async () => {
    apiFetch.mockResolvedValueOnce(
      portfolio({
        totalAccounts: 1,
        entries: [
          {
            accountId: 'a1',
            companyName: 'Alpha',
            quadrant: null,
            quadrantUnavailableReason: "L'axe intérêt n'a pas assez de facteurs connus",
          },
        ],
      }),
    )
    render(<InterestPenetrabilityPortfolioPanel />, { wrapper })
    await waitFor(() => expect(screen.getByText(/position n'est pas encore déterminée/i)).toBeInTheDocument())
    expect(screen.getByText(/1 compte dont/i)).toBeInTheDocument()
  })

  it('signale une lecture tronquée', async () => {
    apiFetch.mockResolvedValueOnce(
      portfolio({
        totalAccounts: 400,
        truncated: true,
        entries: [{ accountId: 'a1', companyName: 'Alpha', quadrant: 'priority_now', quadrantUnavailableReason: null }],
      }),
    )
    render(<InterestPenetrabilityPortfolioPanel />, { wrapper })
    await waitFor(() => expect(screen.getByText(/limitée/i)).toBeInTheDocument())
    expect(screen.getByText(/400/)).toBeInTheDocument()
  })
})
