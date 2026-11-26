import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AcceptInvitationView } from './AcceptInvitationView'

const session = vi.hoisted(() => ({ user: null as null | { id: string } }))
const acceptInvitation = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-router', async importOriginal => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useParams: () => ({ token: 'tok' }),
  useNavigate: () => vi.fn(),
}))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => session }))
vi.mock('@/features/team/api', () => ({ teamApi: { acceptInvitation } }))

/**
 * Grammaire `onboarding-accueil` : le titre de chaque état est le h1 de
 * l'en-tête de page, HORS de la carte ; la carte ne porte que le geste.
 */
describe("AcceptInvitationView — l'invitation dans la coque d'accès", () => {
  beforeEach(() => {
    session.user = null
    acceptInvitation.mockReset()
  })

  it('déconnecté : surtitre Invitation, h1 hors carte, « Se connecter » dans la carte', () => {
    render(<AcceptInvitationView />)
    const heading = screen.getByTestId('access-heading')
    expect(heading.textContent).toMatch(/Invitation/)
    expect(heading.querySelector('h1')).not.toBeNull()
    const card = screen.getByTestId('access-card')
    expect(card.querySelector('h1')).toBeNull()
    expect(card.querySelectorAll('button').length).toBeGreaterThanOrEqual(2)
  })

  it('accepté : pastille « Rejoint » teintée succès et nom de l’espace dans le titre', async () => {
    session.user = { id: 'u1' }
    acceptInvitation.mockResolvedValue({ workspaceName: 'Altimance', role: 'member' })
    render(<AcceptInvitationView />)
    const badge = await screen.findByText(/^(Rejoint|Joined)$/)
    expect(badge.className).toMatch(/success-soft/)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/Altimance/)
  })

  it('échec : pastille teintée danger et le message de l’API comme phrase', async () => {
    session.user = { id: 'u1' }
    acceptInvitation.mockRejectedValue(new Error('Invitation expirée'))
    render(<AcceptInvitationView />)
    const badge = await screen.findByText(/^(Échec|Failed)$/)
    expect(badge.className).toMatch(/danger-soft/)
    expect(screen.getByTestId('access-heading').textContent).toMatch(/Invitation expirée/)
  })
})
