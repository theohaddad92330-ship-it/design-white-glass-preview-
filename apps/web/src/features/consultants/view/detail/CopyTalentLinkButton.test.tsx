import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #2185.52 — « Partager » : la fiche talent est UNIQUE et sa route profonde
 * (`/consultants/$id`) existait, mais aucun geste ne la donnait — même défaut
 * que #2150.43 côté contact, corrigé par `CopyContactLinkButton`. Ce composant
 * en reprend le patron EXACT plutôt que d'en réécrire un second qui
 * divergerait au premier changement (GA-26).
 */

const success = vi.fn()
const error = vi.fn()
vi.mock('sonner', () => ({
  toast: { success: (...a: unknown[]) => success(...a), error: (...a: unknown[]) => error(...a) },
}))

const { CopyTalentLinkButton } = await import('./CopyTalentLinkButton')

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

describe('CopyTalentLinkButton', () => {
  it('copie le lien PROFOND de la fiche', async () => {
    writeText.mockResolvedValue(undefined)
    const user = setupWithClipboard()
    render(<CopyTalentLinkButton talentId="c-42" />)

    await user.click(screen.getByRole('button', { name: 'Copier le lien' }))

    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/consultants/c-42`)
    expect(success).toHaveBeenCalledTimes(1)
    expect(error).not.toHaveBeenCalled()
  })

  it('un presse-papiers refusé se DIT — jamais un « copié » qui n’a pas eu lieu', async () => {
    writeText.mockRejectedValue(new Error('denied'))
    const user = setupWithClipboard()
    render(<CopyTalentLinkButton talentId="c-42" />)

    await user.click(screen.getByRole('button', { name: 'Copier le lien' }))

    expect(error).toHaveBeenCalledTimes(1)
    expect(success).not.toHaveBeenCalled()
  })
})
