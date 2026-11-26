import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { EMPTY_STRUCTURED_LEXICON } from '@bellum/contracts'
import { LexiconView } from '@/features/lexicon/view/LexiconPage'
import { useOfferPortfolio, useUpdateOfferPortfolio } from '@/features/profile/hooks/useOfferPortfolio'
import { useTeam } from '@/features/team/hooks/useTeam'
import { renderWithRouter } from '@/test-utils/renderWithRouter'

vi.mock('@/features/team/hooks/useTeam', () => ({ useTeam: vi.fn() }))
vi.mock('@/features/profile/hooks/useOfferPortfolio', () => ({
  useOfferPortfolio: vi.fn(),
  useUpdateOfferPortfolio: vi.fn(),
}))

/**
 * #2862 (#2437.8) — la moitié VERSIONNÉE de l'épopée : la version, la date et
 * l'AUTEUR de la dernière modification du lexique, jamais devinés côté écran.
 *
 * Recette 27/09 (réel) — RÉFUTÉ : l'écran ne montrait AUCUNE mention de
 * « version », y compris pour un lexique jamais modifié (l'ancienne ligne
 * disparaissait entièrement plutôt que de dire « non mesurée »). La ligne de
 * version est désormais TOUJOURS rendue.
 */
function setup(
  lexicon: { version: number | null; updatedAt: string | null; updatedBy: string | null; overrides: never[] },
  members: { userId: string; fullName: string | null; email: string | null }[] = [],
) {
  vi.mocked(useTeam).mockReturnValue({
    team: { workspace: { role: 'owner' }, members },
    isLoading: false,
  } as unknown as ReturnType<typeof useTeam>)
  vi.mocked(useOfferPortfolio).mockReturnValue({
    data: { lexicon, forbidden_terms: [] },
    isLoading: false,
  } as unknown as ReturnType<typeof useOfferPortfolio>)
  vi.mocked(useUpdateOfferPortfolio).mockReturnValue({ mutate: vi.fn(), isPending: false } as unknown as ReturnType<
    typeof useUpdateOfferPortfolio
  >)
}

describe('LexiconView — version (#2862)', () => {
  it('un lexique jamais modifié dit « non mesurée » — jamais un écran muet sur la version', async () => {
    setup({ ...EMPTY_STRUCTURED_LEXICON, overrides: [] })
    renderWithRouter(<LexiconView />)
    await screen.findByText(/mots de ton équipe/i)
    // #2862 — recette 27/09 : « version » doit apparaître, même sans modification.
    expect(await screen.findByText(/non mesurée/i)).toBeInTheDocument()
    expect(screen.getByText(/non mesurée/i).textContent).toMatch(/version/i)
  })

  it('un lexique déjà modifié montre son numéro de version, sa date et son auteur', async () => {
    setup({ version: 3, updatedAt: '2026-09-01T00:00:00.000Z', updatedBy: 'user-1', overrides: [] }, [
      { userId: 'user-1', fullName: 'Alix Renard', email: null },
    ])
    renderWithRouter(<LexiconView />)
    expect(await screen.findByText(/version 3/i)).toBeInTheDocument()
    expect(screen.getByText(/version 3/i).textContent).toMatch(/Alix Renard/)
  })

  it('un auteur qui n’est plus dans l’équipe reste NOMMÉ, jamais un identifiant nu', async () => {
    setup({ version: 1, updatedAt: '2026-09-01T00:00:00.000Z', updatedBy: 'user-gone', overrides: [] }, [])
    renderWithRouter(<LexiconView />)
    expect(await screen.findByText(/n'est plus dans l'équipe|n’est plus dans l’équipe/i)).toBeInTheDocument()
  })
})
