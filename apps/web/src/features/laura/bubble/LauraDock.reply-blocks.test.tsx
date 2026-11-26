import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { askLaura } from '@/features/chat/api/laura-turn'
import { LauraDock } from './LauraDock'

/**
 * #1914 — LA BULLE REND DU TEXTE : UNE CARTE Y ARRIVE LISIBLE, JAMAIS EN JSON.
 *
 * La bulle n'a pas les cartes de l'écran `/chat` : elle écrit le texte de la
 * réponse tel quel (`whitespace-pre-wrap`). Une réponse à cartes y afficherait
 * donc la clôture `bellum-block` et son JSON, sauf conversion.
 *
 * `askLaura` est mocké : aucun message de test ne part vers le modèle.
 */
vi.mock('@/features/chat/api/laura-turn', () => ({ askLaura: vi.fn() }))
const askLauraMock = vi.mocked(askLaura)

afterEach(() => askLauraMock.mockReset())

describe('LauraDock — une réponse à cartes dans la bulle', () => {
  it('se lit en texte : ni clôture, ni JSON', async () => {
    askLauraMock.mockResolvedValueOnce({
      reply:
        'Voici.\n\n```bellum-block\n{"type":"verdict","conclusion":"Commence par Acme.","reasons":["Appel d’offres ouvert."]}\n```',
    })
    const { container } = renderWithRouter(<LauraDock />)

    fireEvent.click(await screen.findByRole('button', { name: /ouvrir/i }))
    fireEvent.change(await screen.findByPlaceholderText(/demande-moi/i), { target: { value: 'Par où je commence ?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }))

    await waitFor(() => expect(container.textContent).toContain('Commence par Acme.'))
    // #4098 — la puce est rendue en liste (markdown comme /chat), plus le tiret brut.
    expect(container.querySelector('li')?.textContent).toContain('Appel d’offres ouvert.')
    expect(container.textContent).not.toContain('```')
    expect(container.textContent).not.toContain('"type"')
  })

  // #4098 (recette prod 13/10) — « **réserve** », « **partielle** », « **1 crédit** » s'affichaient
  // en markdown BRUT dans le panneau Laura de /accounts/* : même rendu markdown que /chat.
  it('#4098 rend le markdown de la réponse comme /chat, jamais les astérisques bruts', async () => {
    askLauraMock.mockResolvedValueOnce({ reply: 'Couverture **partielle**, une **réserve** : **1 crédit**.' })
    const { container } = renderWithRouter(<LauraDock />)

    fireEvent.click(await screen.findByRole('button', { name: /ouvrir/i }))
    fireEvent.change(await screen.findByPlaceholderText(/demande-moi/i), { target: { value: 'Où en est ce compte ?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }))

    await waitFor(() => expect(container.textContent).toContain('Couverture partielle'))
    expect(container.textContent).not.toContain('**')
    expect(container.querySelector('strong')?.textContent).toBe('partielle')
  })

  it('#4098 le message de la personne reste du texte brut', async () => {
    askLauraMock.mockResolvedValueOnce({ reply: 'Ok.' })
    const { container } = renderWithRouter(<LauraDock />)

    fireEvent.click(await screen.findByRole('button', { name: /ouvrir/i }))
    fireEvent.change(await screen.findByPlaceholderText(/demande-moi/i), { target: { value: 'garde **tel quel**' } })
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }))

    await waitFor(() => expect(container.textContent).toContain('Ok.'))
    expect(container.textContent).toContain('garde **tel quel**')
  })
})
