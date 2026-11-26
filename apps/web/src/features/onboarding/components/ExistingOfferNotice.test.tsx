import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserCredits } from '@/features/credits/api'
import type { PlanCatalog } from '@/lib/plans'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { ExistingOfferNotice } from './ExistingOfferNotice'

const { mockUseCredits, mockUsePlans } = vi.hoisted(() => ({
  mockUseCredits: vi.fn(),
  mockUsePlans: vi.fn(),
}))

vi.mock('@/features/credits/hooks/useCredits', () => ({ useCredits: () => mockUseCredits() }))
vi.mock('@/features/credits/hooks/usePlans', () => ({ usePlans: () => mockUsePlans() }))

const CATALOG: PlanCatalog = {
  team: {
    // Operator-renamed on purpose: the greeting must quote the LIVE catalog.
    label: 'Équipe',
    price: 25900,
    accounts_limit: 50,
    enrichment_credits: 100,
    seats: 3,
    extra_seat_price: 2900,
  },
}

function credits(overrides: Partial<UserCredits> = {}): UserCredits {
  return {
    user_id: 'u1',
    plan: 'decouverte',
    accounts_limit: 1,
    accounts_used: 0,
    enrichment_credits: 5,
    ...overrides,
  }
}

beforeEach(() => {
  mockUseCredits.mockReset()
  mockUsePlans.mockReset()
  mockUsePlans.mockReturnValue({ data: CATALOG })
})

/** The router resolves its route asynchronously, so the notice is mounted next
 *  to a sentinel we can await — otherwise a « renders nothing » assertion would
 *  pass on an empty tree that simply hasn't rendered yet. */
async function renderNotice() {
  const result = renderWithRouter(
    <>
      <ExistingOfferNotice />
      <span data-testid="sentinel" />
    </>,
  )
  await screen.findByTestId('sentinel')
  return result
}

describe('ExistingOfferNotice', () => {
  it('names the tier already served and shows no quota or balance (#4463)', async () => {
    mockUseCredits.mockReturnValue({
      data: credits({ plan: 'team', accounts_limit: 70, enrichment_credits: 100, is_billing_owner: true }),
    })
    await renderNotice()

    expect(screen.getByText(/Équipe/)).toBeInTheDocument()
    expect(screen.getByText(/On enchaîne sur ton profil/)).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/70|100|analyses|enrichissements|crédit/i)
  })

  it('adds who carries the billing when the reader only holds a seat', async () => {
    mockUseCredits.mockReturnValue({ data: credits({ plan: 'team', accounts_limit: 50, is_billing_owner: false }) })
    await renderNotice()

    expect(screen.getByText(/abonnement de ton espace de travail/i)).toBeInTheDocument()
  })

  it('says nothing to a genuinely new account', async () => {
    mockUseCredits.mockReturnValue({ data: credits() })
    const { container } = await renderNotice()
    expect(container.textContent).toBe('')
  })

  it('says nothing while the credits are unknown — no invented plan', async () => {
    mockUseCredits.mockReturnValue({ data: undefined })
    const { container } = await renderNotice()
    expect(container.textContent).toBe('')
  })

  it('still names the tier when the catalog request failed, using the server code', async () => {
    mockUsePlans.mockReturnValue({ data: undefined })
    mockUseCredits.mockReturnValue({ data: credits({ plan: 'beta', accounts_limit: 20, enrichment_credits: 40 }) })
    await renderNotice()

    expect(screen.getByText(/beta/)).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/20 analyses|40 enrichissements/)
  })

  it('never quotes a cap, unlimited or not', async () => {
    mockUseCredits.mockReturnValue({ data: credits({ plan: 'growth', accounts_limit: 999_999 }) })
    await renderNotice()

    expect(screen.queryByText(/999999|999 999|illimit/i)).not.toBeInTheDocument()
  })
})
