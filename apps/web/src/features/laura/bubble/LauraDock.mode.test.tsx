import { fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { askLaura } from '@/features/chat/api/laura-turn'
import { usePlanFeature } from '@/features/plan-features/usePlanFeature'
import { resetLauraPageContext } from '@/features/laura/bubble/page-context-store'
import { LauraDock } from './LauraDock'
import { chooseOption } from '@/test/select'

/**
 * #2450.1 (reste partiel, épopée #2882) — LE MODE DE RECHERCHE, depuis la
 * bulle : jusqu'ici, `requested_mode` (`chat_model_routing.py`) était câblé et
 * testé côté service IA, mais AUCUNE surface produit ne l'atteignait — le
 * défaut que ce dépôt nomme « code juste, jamais appelé ». Ce point d'appel
 * n'est qu'UNE des six surfaces citées par #2448.1 (reste, hors de ce lot) ;
 * les cinq autres restent à câbler séparément.
 */

vi.mock('@/features/chat/api/laura-turn', () => ({ askLaura: vi.fn() }))
vi.mock('@/features/plan-features/usePlanFeature', () => ({
  usePlanFeature: vi.fn(() => ({ known: true, allowed: true })),
}))

const askLauraMock = vi.mocked(askLaura)
const usePlanFeatureMock = vi.mocked(usePlanFeature)

afterEach(() => {
  askLauraMock.mockReset()
  usePlanFeatureMock.mockImplementation(() => ({ known: true, allowed: true }))
  resetLauraPageContext()
})

async function open() {
  fireEvent.click(await screen.findByRole('button', { name: /ouvrir/i }))
}

describe('#2450.1 — le sélecteur de mode de la bulle', () => {
  it('par défaut, « auto » — aucun mode n’est envoyé', async () => {
    askLauraMock.mockResolvedValueOnce({ reply: 'Bonjour.' })
    renderWithRouter(<LauraDock />)
    await open()

    expect(screen.getByRole('combobox', { name: /mode de recherche/i })).toBeInTheDocument()

    fireEvent.change(await screen.findByPlaceholderText(/demande-moi/i), { target: { value: 'Salut' } })
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }))

    expect(askLauraMock).toHaveBeenCalledWith(expect.objectContaining({ mode: 'auto' }))
  })

  it('choisir « Approfondi » force le mode du tour suivant', async () => {
    askLauraMock.mockResolvedValueOnce({ reply: 'Bonjour.' })
    renderWithRouter(<LauraDock />)
    await open()

    await chooseOption(screen.getByRole('combobox', { name: /mode de recherche/i }), 'approfondi')

    fireEvent.change(await screen.findByPlaceholderText(/demande-moi/i), { target: { value: 'Salut' } })
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }))

    expect(askLauraMock).toHaveBeenCalledWith(expect.objectContaining({ mode: 'approfondi' }))
  })

  // #2448.16 (épopée #2882) — le NO-GO de l'issue : les quatre modes ne se
  // distinguent pas QUE par leur libellé.
  it('la promesse affichée change avec le mode choisi', async () => {
    renderWithRouter(<LauraDock />)
    await open()

    expect(screen.getByText(/je choisis le niveau adapté/i)).toBeInTheDocument()

    await chooseOption(screen.getByRole('combobox', { name: /mode de recherche/i }), 'verifie')

    expect(screen.getByText(/je vérifie les points qui ont pu changer/i)).toBeInTheDocument()
    expect(screen.queryByText(/je choisis le niveau adapté/i)).not.toBeInTheDocument()
  })
})
