import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #2150.43 — « Porte d'entrée : lien partagé ». La route profonde `/contacts/$id`
 * existait, mais aucun geste ne la donnait : partager une fiche demandait de
 * recopier la barre d'adresse.
 */

const success = vi.fn()
const error = vi.fn()
vi.mock('sonner', () => ({
  toast: { success: (...a: unknown[]) => success(...a), error: (...a: unknown[]) => error(...a) },
}))

const { useCopyContactLink } = await import('./CopyContactLinkButton')

/** #4504.2 — la copie vit dans le menu « … » de la fiche ; ce banc la monte sur un bouton témoin. */
function CopyContactLinkButton({ contactId }: { contactId: string }) {
  const copy = useCopyContactLink(contactId)
  return (
    <button type="button" onClick={copy}>
      Copier le lien
    </button>
  )
}

const writeText = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
})

/** ⚠️ `userEvent.setup()` installe SON presse-papiers factice sur `navigator` :
 *  le nôtre se pose APRÈS, sinon le spy n'est jamais appelé. */
function setupWithClipboard() {
  const user = userEvent.setup()
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  return user
}

describe('useCopyContactLink', () => {
  it('copie le lien PROFOND de la fiche unique, sans l’origine de navigation de qui le copie', async () => {
    writeText.mockResolvedValue(undefined)
    const user = setupWithClipboard()
    render(<CopyContactLinkButton contactId="c-42" />)

    await user.click(screen.getByRole('button', { name: 'Copier le lien' }))

    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/contacts/c-42`)
    expect(success).toHaveBeenCalledTimes(1)
    expect(error).not.toHaveBeenCalled()
  })

  it('un presse-papiers refusé se DIT — jamais un « copié » qui n’a pas eu lieu', async () => {
    writeText.mockRejectedValue(new Error('denied'))
    const user = setupWithClipboard()
    render(<CopyContactLinkButton contactId="c-42" />)

    await user.click(screen.getByRole('button', { name: 'Copier le lien' }))

    expect(error).toHaveBeenCalledTimes(1)
    expect(success).not.toHaveBeenCalled()
  })
})
