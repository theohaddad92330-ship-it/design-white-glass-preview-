import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

/**
 * ⚠️ Le type de l'argument est DÉCLARÉ, il ne se devine pas — même piège que
 * documenté dans `ShareConversation.test.tsx` (TS2493 au `tsc`, invisible en
 * vitest).
 */
function clipboardSpy(impl?: (text: string) => Promise<void>) {
  const writeText = vi.fn<(text: string) => Promise<void>>(impl ?? (() => Promise.resolve()))
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  return writeText
}

const { CopyQuestion } = await import('./CopyQuestion')

// #2226 — « je n'arrive pas à copier coller mes propres requêtes » : la bulle
// de question n'avait AUCUN bouton copier, contrairement à la réponse de Laura
// (`ReplyFooter::CopyReply`, le patron suivi ici).
describe('CopyQuestion — #2226 copier sa propre question', () => {
  beforeEach(() => vi.clearAllMocks())

  it('copie le texte BRUT de la question, et le dit par un toast', async () => {
    const writeText = clipboardSpy()
    const { toast } = await import('sonner')
    render(<CopyQuestion text="Trouve moi 10 comptes en IDF." />)
    await userEvent.click(screen.getByRole('button', { name: /copier/i }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Trouve moi 10 comptes en IDF.'))
    expect(toast.success).toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('sait dire NON — un presse-papier refusé ne prétend PAS avoir copié', async () => {
    clipboardSpy(() => Promise.reject(new Error('denied')))
    const { toast } = await import('sonner')
    render(<CopyQuestion text="Une question." />)
    await userEvent.click(screen.getByRole('button', { name: /copier/i }))
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(toast.success).not.toHaveBeenCalled()
  })

  // Témoin voisin — la garde GA-32 ne doit pas s'émouvoir d'un bouton texte
  // ordinaire posé à côté : ici on vérifie juste que LE NÔTRE porte un nom.
  it('porte un nom accessible (GA-32 : une icône seule)', () => {
    render(<CopyQuestion text="Une question." />)
    expect(screen.getByRole('button', { name: /copier/i })).toHaveAccessibleName()
  })
})
