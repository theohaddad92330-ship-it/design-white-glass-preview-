import { fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { askLaura } from '@/features/chat/api/laura-turn'
import { LauraDock } from './LauraDock'

/**
 * #1953.18 — « le brouillon survit à la fermeture du drawer », côté BULLE.
 *
 * ⚠️ Ce test verrouille un comportement déjà VRAI (voir le docblock à côté de
 * `input` dans `LauraDock.tsx`), pas un correctif : `input` vit dans
 * `LauraBubble`, monté à la racine du routeur, jamais démonté par
 * l'ouverture/fermeture du panneau (`LauraBubblePanel`, elle, se démonte).
 * Sans ce test, un futur refactor qui déplacerait `input` DANS le panneau
 * casserait ce point sans qu'aucune suite ne le voie — exactement le défaut
 * que ce lot corrige côté `/chat`.
 */

vi.mock('@/features/chat/api/laura-turn', () => ({ askLaura: vi.fn() }))
const askLauraMock = vi.mocked(askLaura)

afterEach(() => {
  askLauraMock.mockClear()
})

describe('LauraDock — la bulle garde son brouillon à la fermeture du panneau', () => {
  it('rouvrir après « Fermer » retrouve le texte tapé, non envoyé', async () => {
    renderWithRouter(<LauraDock />)

    fireEvent.click(await screen.findByRole('button', { name: /ouvrir/i }))
    const composer = await screen.findByPlaceholderText('Demande-moi quelque chose…')
    fireEvent.change(composer, { target: { value: 'Résume ce compte avant mon appel' } })

    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
    expect(screen.queryByPlaceholderText('Demande-moi quelque chose…')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /ouvrir/i }))
    expect(await screen.findByPlaceholderText('Demande-moi quelque chose…')).toHaveValue(
      'Résume ce compte avant mon appel',
    )
    // Rien n'est parti pendant tout ce va-et-vient.
    expect(askLauraMock).not.toHaveBeenCalled()
  })
})
