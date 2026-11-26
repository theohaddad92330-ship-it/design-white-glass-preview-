import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ShareConversation } from './ShareConversation'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

/**
 * ⚠️ Le type de l'argument est DÉCLARÉ, il ne se devine pas.
 *
 * `vi.fn(() => Promise.resolve())` infère ses arguments depuis l'implémentation
 * — ici aucune, donc le tuple VIDE `[]`. `mock.calls[0][0]` devient alors une
 * erreur de compilation (`TS2493`), et elle n'apparaît qu'au `tsc` : les tests
 * eux-mêmes passent au vert, puisque le comportement est correct à l'exécution.
 * C'est ce qui a cassé le build Vercel du 26/08 — `pnpm build` enchaîne
 * `vite build && tsc --noEmit`, et ce dernier lit AUSSI les fichiers de test.
 */
function clipboardSpy(impl?: (text: string) => Promise<void>) {
  const writeText = vi.fn<(text: string) => Promise<void>>(impl ?? (() => Promise.resolve()))
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  return writeText
}

/**
 * #1955.13 — ouvre le popover de partage sans copier : c'est le bouton
 * « Partager » qui déclenche le rendu, la copie elle-même vient d'un second
 * geste À L'INTÉRIEUR du popover.
 */
async function openShareMenu() {
  await userEvent.click(screen.getByRole('button', { name: /^partager dans l.espace$/i }))
}

describe('ShareConversation — #1955.13 dire qui pourra lire AVANT de copier', () => {
  beforeEach(() => vi.clearAllMocks())

  // #5047 — ligne du menu ⋯ : le libellé reste visible (revient sur #4876, icône seule sous 768 px).
  it('le libellé reste visible : c’est une ligne du menu ⋯, plus un bouton de la rangée', () => {
    render(<ShareConversation accountId="a1" conversationId="c1" />)
    const button = screen.getByRole('button', { name: /^partager dans l.espace$/i })
    expect(button.querySelector('.max-md\\:sr-only')).toBeNull()
    expect(button).toHaveClass('pointer-coarse:min-h-11')
  })

  it('le clic sur « Partager » ouvre un menu — il NE COPIE PAS tout de suite', async () => {
    const writeText = clipboardSpy()
    render(<ShareConversation accountId="acc-1" conversationId="conv-9" />)
    await openShareMenu()
    expect(writeText).not.toHaveBeenCalled()
  })

  it('la phrase dit qui pourra lire, avant tout clic sur le bouton de copie', async () => {
    render(<ShareConversation accountId="acc-1" conversationId="conv-9" />)
    await openShareMenu()
    expect(screen.getByText('Les membres de ton espace pourront lire cette conversation.')).toBeInTheDocument()
  })

  it('un second geste, DANS le menu, copie le lien — porte le fil ET le compte', async () => {
    // La portée voyage avec la conversation : sans le compte, le destinataire
    // ouvre le bon fil dans le mauvais périmètre, et la suite de l'échange
    // porte sur autre chose que ce qu'il vient de lire.
    const writeText = clipboardSpy()
    render(<ShareConversation accountId="acc-1" conversationId="conv-9" />)
    await openShareMenu()
    await userEvent.click(screen.getByRole('button', { name: /copier le lien/i }))
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    const url = new URL(writeText.mock.calls[0]![0] as string)
    expect(url.pathname).toBe('/chat')
    expect(url.searchParams.get('accountId')).toBe('acc-1')
    expect(url.searchParams.get('conversationId')).toBe('conv-9')
  })

  it('un fil de portefeuille n’invente PAS de compte', async () => {
    const writeText = clipboardSpy()
    render(<ShareConversation accountId={null} conversationId="general" />)
    await openShareMenu()
    await userEvent.click(screen.getByRole('button', { name: /copier le lien/i }))
    await waitFor(() => expect(writeText).toHaveBeenCalled())
    const url = new URL(writeText.mock.calls[0]![0] as string)
    expect(url.searchParams.has('accountId')).toBe(false)
    expect(url.searchParams.get('conversationId')).toBe('general')
  })

  it('sait dire NON — un presse-papier refusé ne prétend PAS avoir copié', async () => {
    // Un « copié ! » sans copie fait coller autre chose : la personne croit
    // partager sa conversation et envoie ce qu'elle avait avant.
    const { toast } = await import('sonner')
    clipboardSpy(() => Promise.reject(new Error('denied')))
    render(<ShareConversation accountId="acc-1" conversationId="conv-9" />)
    await openShareMenu()
    await userEvent.click(screen.getByRole('button', { name: /copier le lien/i }))
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(toast.success).not.toHaveBeenCalled()
  })
})

/**
 * #3775.2b — « Partager un lien ne partage pas les identifiants d'un
 * connecteur ; un extrait sensible déjà écrit n'est pas protégé par la
 * fermeture de sa source. » `hasRestrictedSource` (calculée par l'appelant,
 * `Chat.tsx`, à partir de ce que le serveur a marqué — #3775.2b côté API) dit
 * si ce fil cite une connexion personnelle ; ce composant se contente de
 * l'afficher, jamais de la recalculer.
 */
describe('ShareConversation — #3775.2b dire quand une source personnelle est déjà citée', () => {
  beforeEach(() => vi.clearAllMocks())

  it('le menu ajoute l’avertissement quand le fil cite une source personnelle', async () => {
    render(<ShareConversation accountId="acc-1" conversationId="conv-9" hasRestrictedSource />)
    await openShareMenu()
    expect(screen.getByText(/connexion personnelle.*ta messagerie.*un collègue qui ouvre ce lien/)).toBeInTheDocument()
  })

  it('aucun avertissement sans source personnelle citée — le cas normal, et le défaut sans la prop', async () => {
    render(<ShareConversation accountId="acc-1" conversationId="conv-9" />)
    await openShareMenu()
    expect(screen.queryByText(/connexion personnelle/)).not.toBeInTheDocument()
  })
})
