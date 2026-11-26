import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #4423.2 — « Résumé, personnalisation et coaching : Échec » sans raison. Aucune raison n'est stockée
 * sur le profil : l'écran le DIT, il ne montre jamais un statut nu.
 */
const useProfileContextMock = vi.fn()
vi.mock('@/features/profile-context/hooks/useProfileContext', () => ({
  useProfileContext: () => useProfileContextMock(),
}))
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))

const { ProfileContextSection } = await import('./ProfileContextSection')

beforeEach(() => useProfileContextMock.mockReset())

describe('ProfileContextSection', () => {
  it('un échec dit que la raison n’est pas enregistrée', () => {
    useProfileContextMock.mockReturnValue({ data: { profile_context: null, status: 'failed' } })
    render(<ProfileContextSection />)
    expect(screen.getByText(/Échec/).textContent).toMatch(/raison non enregistrée/)
  })

  it('#4969 un échec dont la raison est enregistrée la DIT', () => {
    useProfileContextMock.mockReturnValue({
      data: { profile_context: null, status: 'failed', failureReason: 'model_unreachable' },
    })
    render(<ProfileContextSection />)
    expect(screen.getByText(/Échec/).textContent).toMatch(/service d’analyse/)
    expect(screen.queryByText(/raison non enregistrée/)).toBeNull()
  })

  it('un statut sans échec reste inchangé', () => {
    useProfileContextMock.mockReturnValue({ data: { profile_context: null, status: 'generating' } })
    render(<ProfileContextSection />)
    expect(screen.getByText('En cours')).toBeTruthy()
  })
})
