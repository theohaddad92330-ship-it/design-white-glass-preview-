import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { useCredits } from '@/features/credits/hooks/useCredits'
import { usePlans } from '@/features/credits/hooks/usePlans'
import { UpgradeBenefits } from '@/features/plan-features/UpgradeBenefits'
import { renderWithRouter } from '@/test-utils/renderWithRouter'

vi.mock('@/features/credits/hooks/useCredits', () => ({ useCredits: vi.fn() }))
vi.mock('@/features/credits/hooks/usePlans', () => ({ usePlans: vi.fn() }))

function mockCatalog() {
  vi.mocked(usePlans).mockReturnValue({
    data: {
      starter: { label: 'Starter-Solo', price: 11900, features: ['exports'] },
      team: { label: 'Team', price: 25900, features: ['exports', 'chat_ai', 'discover'] },
    },
  } as unknown as ReturnType<typeof usePlans>)
  vi.mocked(useCredits).mockReturnValue({
    data: { features: ['exports'] },
  } as unknown as ReturnType<typeof useCredits>)
}

describe('UpgradeBenefits', () => {
  it("nomme le palier, son prix et ce qu'il débloque", async () => {
    mockCatalog()
    renderWithRouter(<UpgradeBenefits feature="chat_ai" />)
    expect(await screen.findByText(/Ce que Team débloque \(259/)).toBeTruthy()
    expect(screen.getByText('Laura')).toBeTruthy()
    expect(screen.getByText('Découvrir')).toBeTruthy()
  })

  it("le bouton d'upgrade est un VRAI bouton, pas un lien nu", async () => {
    // `Button asChild` déléguait son style à Radix Slot, qui ne fusionne que
    // dans un enfant unique : avec le gabarit interne du bouton, l'appelant
    // recevait un lien SANS classes — un « bouton » invisible en production.
    mockCatalog()
    renderWithRouter(<UpgradeBenefits feature="chat_ai" />)
    const cta = await screen.findByRole('link', { name: /Team/ })
    expect(cta).toHaveAttribute('href', '/billing')
    expect(cta.className).toContain('bg-[var(--bellum-primary)]')
  })
})
