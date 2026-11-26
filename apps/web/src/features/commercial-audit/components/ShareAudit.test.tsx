import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ShareAudit } from './ShareAudit'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function clipboardSpy(impl?: (text: string) => Promise<void>) {
  const writeText = vi.fn<(text: string) => Promise<void>>(impl ?? (() => Promise.resolve()))
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  return writeText
}

async function openShareMenu() {
  await userEvent.click(screen.getByRole('button', { name: /^partager$/i }))
}

/**
 * #2075.17 — même exigence que `ShareConversation` (#1955.13) : dire qui
 * pourra lire AVANT de copier, et ne jamais prétendre avoir copié un lien
 * refusé par le presse-papier.
 */
describe('ShareAudit — #2075.17 partager dans le workspace', () => {
  beforeEach(() => vi.clearAllMocks())

  it('le clic sur « Partager » ouvre un menu — il NE COPIE PAS tout de suite', async () => {
    const writeText = clipboardSpy()
    render(<ShareAudit />)
    await openShareMenu()
    expect(writeText).not.toHaveBeenCalled()
  })

  it('la phrase dit qui pourra lire, avant tout clic sur le bouton de copie', async () => {
    render(<ShareAudit />)
    await openShareMenu()
    expect(screen.getByText('Les membres de ton espace pourront lire cet audit.')).toBeInTheDocument()
  })

  it('un second geste, DANS le menu, copie le lien FIXE de l’audit', async () => {
    const writeText = clipboardSpy()
    render(<ShareAudit />)
    await openShareMenu()
    await userEvent.click(screen.getByRole('button', { name: /copier le lien/i }))
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    const url = new URL(writeText.mock.calls[0]![0] as string)
    expect(url.pathname).toBe('/settings/profile/audit')
  })

  it('sait dire NON — un presse-papier refusé ne prétend PAS avoir copié', async () => {
    const { toast } = await import('sonner')
    clipboardSpy(() => Promise.reject(new Error('denied')))
    render(<ShareAudit />)
    await openShareMenu()
    await userEvent.click(screen.getByRole('button', { name: /copier le lien/i }))
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(toast.success).not.toHaveBeenCalled()
  })
})
