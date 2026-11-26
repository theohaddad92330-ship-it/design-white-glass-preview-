import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCredits } from '../hooks/useCredits'
import { UpgradeCard } from './UpgradeCard'

vi.mock('../hooks/useCredits', () => ({ useCredits: vi.fn() }))
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))

function mock(credits: Record<string, unknown> | null) {
  vi.mocked(useCredits).mockReturnValue({ credits } as unknown as ReturnType<typeof useCredits>)
}

describe('UpgradeCard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders nothing on a demo workspace — no upsell, no "fin de ton essai"', () => {
    mock({ plan: 'decouverte', is_demo: true })
    const { container } = render(<UpgradeCard />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing on the top plan', () => {
    mock({ plan: 'growth' })
    const { container } = render(<UpgradeCard />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing for a beta account — nothing to sell to a tester (#3552)', () => {
    mock({ plan: 'beta' })
    const { container } = render(<UpgradeCard />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the upsell for a trial account', () => {
    mock({ plan: 'trial' })
    const { container } = render(<UpgradeCard />)
    expect(container).not.toBeEmptyDOMElement()
  })

  // #4466 — plus de bouton de recharge ni de mot « crédit » dans l'offre.
  it("ne propose ni recharge ni crédits — seulement de choisir ou changer d'offre (#4466)", () => {
    mock({ plan: 'starter' })
    const { container } = render(<UpgradeCard />)
    expect(container.textContent ?? '').not.toMatch(/crédit|credit|recharg/i)
    expect(container.querySelectorAll('button')).toHaveLength(1)
  })
})
