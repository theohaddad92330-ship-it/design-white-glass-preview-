import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { LauraDock } from '@/features/laura/bubble/LauraDock'
import { BurstPanel } from './BurstPanel'
import type { useTodayGestures } from './useTodayGestures'

vi.mock('./useTodayGestures', () => ({ CALL_OUTCOMES: [], useTodayGestures: () => ({}) }))

/**
 * #4163 LF point 3 — recette écran en prod (14/10) : le rond de Laura (bas-droite) recouvrait « Suivant »
 * du mode rafale. Le panneau plein écran réclame le coin : le lanceur s'efface tant qu'il est ouvert.
 */
const settle = () => new Promise(resolve => setTimeout(resolve, 80))

const burst = (
  <BurstPanel
    deck={[]}
    live={[]}
    group="email"
    now={new Date(2026, 9, 14, 10)}
    gestures={{} as ReturnType<typeof useTodayGestures>}
    members={[]}
    hasMandate={false}
    onSkip={vi.fn()}
    onClose={vi.fn()}
  />
)

describe('Rafale — le widget de Laura ne recouvre pas « Suivant »', () => {
  it('le lanceur de Laura reste visible sans rafale', async () => {
    renderWithRouter(<LauraDock />, '/actions')
    expect(await screen.findByRole('button', { name: /ouvrir/i })).not.toHaveClass('hidden')
  })

  it('le lanceur de Laura s’efface pendant la rafale', async () => {
    renderWithRouter(
      <>
        <LauraDock />
        {burst}
      </>,
      '/actions',
    )
    await settle()
    // Le Dialog masque déjà ses voisins aux lecteurs d'écran (aria-hidden) : on regarde le DOM, pas l'arbre d'accessibilité.
    await waitFor(() => expect(screen.getByLabelText(/ouvrir/i, { selector: 'button' })).toHaveClass('hidden'))
  })
})
