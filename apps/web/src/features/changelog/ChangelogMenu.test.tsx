import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { i18n } from '@/i18n'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { PRODUCT_TOUR_STEPS } from '@/features/product-tour/tour-steps'
import { useProductTourStore } from '@/features/product-tour/product-tour-store'

// Radix a besoin de ces API pointer, absentes de jsdom (même mise en garde que
// `bottom-anchored-overlays.test.tsx`).
beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
})

const user = () => userEvent.setup({ pointerEventsCheck: 0 })

vi.mock('@/features/changelog/useChangelog', () => ({
  useChangelog: () => ({
    entries: [{ id: '2026-09-10-x', date: '10 septembre 2026', title: 'Une entrée', items: ['Un item.'] }],
    hasUnseen: false,
    markAllSeen: vi.fn(),
  }),
}))

const { ChangelogMenu } = await import('./ChangelogMenu')

/**
 * #1794.2 — le bouton qui relance la visite guidée vit dans le changelog.
 *
 * Verbatim du retour : « pourquoi pas ranger ce bouton dans le changelog en
 * bas à gauche ». Cette suite prouve les deux moitiés : le bouton EXISTE dans
 * le panneau, et il ouvre VRAIMENT la visite — pas seulement un état local
 * muet.
 */
describe('#1794.2 — ChangelogMenu ouvre la visite guidée', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    // ⚠️ Le store de la visite est un singleton : sans cette remise à zéro, le
    // test « rien ne démarre » voit l'état laissé par le test précédent et
    // passe (ou tombe) pour une raison qui n'est pas la sienne.
    useProductTourStore.setState({ phase: 'off', index: 0, hasVisited: false })
  })

  it('le panneau « Nouveautés » porte un bouton pour revoir la visite guidée', async () => {
    renderWithRouter(<ChangelogMenu />)
    await user().click(await screen.findByRole('button', { name: /Nouveautés/i }))

    expect(await screen.findByRole('button', { name: 'Revoir la visite guidée' })).toBeInTheDocument()
  })

  it('cliquer dessus ferme le panneau ET démarre la visite, sur sa PREMIÈRE étape', async () => {
    // ⚠️ #1863.3 — la visite ne se MONTE plus ici. Elle est montée à la RACINE
    // pour survivre à la navigation (c'était tout l'objet du lot : cliquer une
    // étape faisait auparavant disparaître la visite avec la page qu'on venait
    // d'obtenir). Ce menu ne fait donc plus qu'ouvrir l'état partagé.
    //
    // Chercher un `role="dialog"` ici reviendrait à tester le montage d'un
    // composant voisin, et ce test tomberait pour une bonne raison la prochaine
    // fois qu'on déplacerait la visite.
    renderWithRouter(<ChangelogMenu />)
    await user().click(await screen.findByRole('button', { name: /Nouveautés/i }))
    await user().click(await screen.findByRole('button', { name: 'Revoir la visite guidée' }))

    const state = useProductTourStore.getState()
    expect(state.phase).toBe('reading')
    expect(state.index).toBe(0)
    expect(PRODUCT_TOUR_STEPS[state.index]).toBe(PRODUCT_TOUR_STEPS[0])

    // Le panneau du changelog referme : une seule surcouche ouverte à la fois.
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('rien ne démarre tant que le bouton n’a pas été cliqué', async () => {
    renderWithRouter(<ChangelogMenu />)
    await user().click(await screen.findByRole('button', { name: /Nouveautés/i }))

    expect(useProductTourStore.getState().phase).toBe('off')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
