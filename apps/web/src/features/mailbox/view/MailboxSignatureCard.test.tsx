import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { useMailboxSignature, useSaveMailboxSignature } from '../api'
import { MailboxSignatureCard } from './MailboxSignatureCard'

vi.mock('../api', () => ({
  useMailboxSignature: vi.fn(),
  useSaveMailboxSignature: vi.fn(),
}))

const user = () => userEvent.setup({ pointerEventsCheck: 0 })
const mutate = vi.fn()

function setSignature(signature: string | null, isLoading = false) {
  vi.mocked(useMailboxSignature).mockReturnValue({
    data: signature === null && isLoading ? undefined : { signature },
    isLoading,
  } as unknown as ReturnType<typeof useMailboxSignature>)
}

describe('MailboxSignatureCard — l’écran ne dit plus « aucune signature » à tout le monde', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    mutate.mockClear()
    vi.mocked(useSaveMailboxSignature).mockReturnValue({
      mutate,
      isPending: false,
    } as unknown as ReturnType<typeof useSaveMailboxSignature>)
  })

  it('montre la signature résolue par le serveur, et non un champ vide', () => {
    setSignature('Camille Roy — Bellum')
    render(<MailboxSignatureCard />)

    expect(screen.getByRole('textbox', { name: 'Ta signature' })).toHaveValue('Camille Roy — Bellum')
    expect(screen.getByText('Elle sera ajoutée au bas de tes brouillons.')).toBeInTheDocument()
  })

  it('dit « aucune » quand il n’y en a aucune — pas un cadre vide qui se lit comme un bug', () => {
    setSignature(null)
    render(<MailboxSignatureCard />)

    expect(screen.getByText('Aucune signature : tes brouillons partiront sans.')).toBeInTheDocument()
  })

  it('n’affirme rien tant qu’il n’a pas lu — « pas encore lu » n’est pas « aucune »', () => {
    setSignature(null, true)
    render(<MailboxSignatureCard />)

    expect(screen.queryByText('Aucune signature : tes brouillons partiront sans.')).not.toBeInTheDocument()
  })

  it('enregistre ce qui est saisi', async () => {
    setSignature(null)
    render(<MailboxSignatureCard />)

    await user().type(screen.getByRole('textbox', { name: 'Ta signature' }), 'Camille')
    await user().click(screen.getByRole('button', { name: 'Enregistrer la signature' }))
    // Le PREMIER argument, nommément : le second porte les rappels de succès et
    // d'échec, et un `expect.anything()` à sa place ne garderait rien.
    expect(mutate).toHaveBeenCalledTimes(1)
    expect(mutate.mock.calls[0]?.[0]).toBe('Camille')
  })
})
