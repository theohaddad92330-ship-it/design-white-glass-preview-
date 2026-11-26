import { screen, waitFor } from '@testing-library/react'
import { deriveAccountStrategy5P } from '@bellum/contracts'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { AccountStrategy5PSection } from './AccountStrategy5PSection'

const useAccountStrategy5P = vi.hoisted(() => vi.fn())
vi.mock('@/features/accounts/hooks/useAccountStrategy5P', () => ({ useAccountStrategy5P }))

describe('AccountStrategy5PSection', () => {
  it('appelle la façade AVEC l’identifiant du compte, et se tait sans réponse (jamais « rien de connu »)', async () => {
    useAccountStrategy5P.mockReturnValue({ data: null })
    const { container } = renderWithRouter(<AccountStrategy5PSection accountId="acc-1" />)

    // ⚠️ APRÈS le rendu : `renderWithRouter` monte à travers un routeur, donc
    // l'assertion posée avant l'attente compterait zéro appel et passerait
    // pour une preuve — même piège que `AccountCanonicalContextSection.test.tsx`.
    await waitFor(() => expect(useAccountStrategy5P).toHaveBeenCalledWith('acc-1'))
    expect(container.textContent).toBe('')
  })

  // #3715 — les cinq cartes annexes ne s'empilent plus : ni repliées, ni ouvertes.
  it('#3715 — plus aucune des cinq cartes annexes dans la synthèse', async () => {
    useAccountStrategy5P.mockReturnValue({
      data: deriveAccountStrategy5P({ accountId: 'acc-1', analysis: {}, contacts: [] }),
    })
    renderWithRouter(<AccountStrategy5PSection accountId="acc-1" />)
    await screen.findByText('Cinq questions de terrain')
    expect(screen.queryByRole('button', { name: /Cartes du compte/ })).not.toBeInTheDocument()
    for (const title of ['Colonnes du compte', 'Flux de décision', 'Carte de périmètre', 'Carte d’influence'])
      expect(screen.queryByText(title)).not.toBeInTheDocument()
  })

  it('#3675 — SAIT DIRE NON : sans réponse de la façade, aucune section « Cartes du compte »', async () => {
    useAccountStrategy5P.mockReturnValue({ data: null })
    renderWithRouter(<AccountStrategy5PSection accountId="acc-1" />)
    await waitFor(() => expect(useAccountStrategy5P).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: /Cartes du compte/ })).not.toBeInTheDocument()
  })
})
