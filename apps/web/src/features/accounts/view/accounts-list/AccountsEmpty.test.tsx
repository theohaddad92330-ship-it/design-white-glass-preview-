import { fireEvent, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { AccountsEmpty } from './AccountsEmpty'

const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }))

// F1-FIX #4345 — sur bureau « Demander à Laura » ouvre la bulle SUR PLACE ; ce test garde l'AUTRE chemin
// (mobile, surcouche, /chat : le hook rend `null` et le lien vers /chat reste le seul accès).
vi.mock('@/features/laura/bubble/use-open-laura-in-place', () => ({ useOpenLauraInPlace: () => null }))
vi.mock('@tanstack/react-router', async importOriginal => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => navigateMock,
}))

beforeEach(() => {
  navigateMock.mockReset()
})

describe('AccountsEmpty', () => {
  it('is action-oriented: invites to ask Laura for accounts in one sentence, not a mute blank page', async () => {
    renderWithRouter(<AccountsEmpty />)

    expect(await screen.findByText("Aucun compte analysé pour l'instant")).toBeInTheDocument()
    expect(screen.getByText(/en une phrase/)).toBeInTheDocument()
  })

  it('#3905 — leads to Laura (/chat) with the example sentence pre-filled, never to a launcher', async () => {
    renderWithRouter(<AccountsEmpty />)

    fireEvent.click(await screen.findByRole('button', { name: /Demander des comptes à Laura/ }))
    expect(navigateMock).toHaveBeenCalledWith({
      to: '/chat',
      search: { prompt: 'Trouve-moi 10 comptes dans mon secteur' },
    })
    expect(navigateMock).not.toHaveBeenCalledWith({ to: '/search' })
  })
})
