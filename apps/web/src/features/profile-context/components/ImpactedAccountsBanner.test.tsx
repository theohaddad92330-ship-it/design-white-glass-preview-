import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { ImpactedAccountsBanner } from './ImpactedAccountsBanner'

/**
 * #2306.24 — « et si je change mes secteurs/offres, quels comptes sont
 * impactés ? » L'API agrège déjà (`GET /accounts/impacted-by-profile-change`),
 * cette bannière est l'écran manquant. Present-only, même patron que
 * `ProfileContextVersions.test.tsx` : rien tant qu'il n'y a rien à dire.
 */

const useImpactedAccountsMock = vi.fn()
vi.mock('@/features/accounts/hooks/useImpactedAccounts', () => ({
  useImpactedAccounts: () => useImpactedAccountsMock(),
}))

describe('ImpactedAccountsBanner — #2306.24 (present-only)', () => {
  it('renders nothing while loading', () => {
    useImpactedAccountsMock.mockReturnValue({ data: undefined, isLoading: true })
    const { container } = render(<ImpactedAccountsBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when no account is impacted', () => {
    useImpactedAccountsMock.mockReturnValue({
      data: { currentEsnProfileVersion: 5, accounts: [] },
      isLoading: false,
    })
    const { container } = render(<ImpactedAccountsBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('lists each impacted account as a real link, never invented', async () => {
    useImpactedAccountsMock.mockReturnValue({
      data: {
        currentEsnProfileVersion: 5,
        accounts: [
          { accountId: 'acc-1', companyName: 'Société Générale', esnProfileVersion: 3 },
          { accountId: 'acc-2', companyName: 'BNP', esnProfileVersion: 2 },
        ],
      },
      isLoading: false,
    })
    renderWithRouter(<ImpactedAccountsBanner />)

    // le contenu n'apparaît qu'une fois la route (TanStack Router, async) résolue —
    // même patron que AccountLaunchSurface.test.tsx : la première assertion attend.
    expect(await screen.findByText('2 comptes ont été analysés avec un profil antérieur.')).toBeInTheDocument()
    const first = screen.getByRole('link', { name: /Société Générale/ })
    expect(first).toHaveAttribute('href', '/accounts/acc-1')
    expect(screen.getByRole('link', { name: /BNP/ })).toHaveAttribute('href', '/accounts/acc-2')
  })

  it('singulier au premier compte', async () => {
    useImpactedAccountsMock.mockReturnValue({
      data: {
        currentEsnProfileVersion: 5,
        accounts: [{ accountId: 'acc-1', companyName: 'Acme', esnProfileVersion: 4 }],
      },
      isLoading: false,
    })
    renderWithRouter(<ImpactedAccountsBanner />)
    expect(await screen.findByText('1 compte a été analysé avec un profil antérieur.')).toBeInTheDocument()
  })
})
