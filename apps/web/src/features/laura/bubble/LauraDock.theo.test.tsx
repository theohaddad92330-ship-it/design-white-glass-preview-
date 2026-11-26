import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { LauraDock } from './LauraDock'

vi.mock('@/features/chat/api/laura-turn', () => ({ askLaura: vi.fn() }))
vi.mock('@/features/plan-features/usePlanFeature', () => ({
  usePlanFeature: vi.fn(() => ({ known: true, allowed: true })),
}))

/**
 * THEO-REFONTE-COMPOSANTS — le panneau Laura global, mesuré contre `drawer-v2` (Théo) et
 * `#pan-laura-bulle` (MAQ-LAURA, validée le 19/10).
 */
describe('Laura sur place — la forme des maquettes', () => {
  it('le lanceur se nomme (visage + « Laura »), il n’est plus un rond muet', async () => {
    renderWithRouter(<LauraDock />)
    const launcher = await screen.findByRole('button', { name: /ouvrir/i })
    expect(launcher).toHaveTextContent('Laura')
  })

  it('ouvert : un tiroir de droite pleine hauteur, dans l’ordre constat → ce qui attend → amorces → saisie', async () => {
    renderWithRouter(<LauraDock />)
    fireEvent.click(await screen.findByRole('button', { name: /ouvrir/i }))
    const panel = await screen.findByRole('region', { name: 'Laura' })
    expect(panel.className).toContain('top-3')
    expect(panel.className).toContain('right-3')
    expect(panel.className).not.toContain('max-h-[min(34rem')

    const headings = ['Ce que je vois de ton écran', 'Ce qui t’attend', 'Pour commencer'].map(label =>
      within(panel).getByText(label),
    )
    for (let i = 1; i < headings.length; i += 1) {
      expect(headings[i - 1].compareDocumentPosition(headings[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    // Les amorces sont des choix cadrés, et le geste d'envoi se NOMME.
    expect(within(panel).getByRole('button', { name: 'Explique-moi cet écran' }).className).toContain('border')
    expect(within(panel).getByRole('button', { name: 'Envoyer' })).toBeInTheDocument()
  })
})
