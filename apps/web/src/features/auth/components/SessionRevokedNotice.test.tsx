import { fireEvent, render, screen } from '@testing-library/react'
import { MAX_ACTIVE_DEVICES } from '@bellum/contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionRevokedNotice } from './SessionRevokedNotice'

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  acknowledge: vi.fn(),
  sessionRevoked: true,
  pathname: '/accounts',
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mocks.navigate,
  useRouterState: ({ select }: { select: (s: { location: { pathname: string } }) => unknown }) =>
    select({ location: { pathname: mocks.pathname } }),
}))
vi.mock('../session-manager', () => ({
  sessionManager: {
    subscribe: () => () => undefined,
    getState: () => ({ user: null, loading: false, sessionUnavailable: false, sessionRevoked: mocks.sessionRevoked }),
    acknowledgeRevocation: () => mocks.acknowledge(),
  },
}))

/**
 * R15-7 (15/09/2026) — l'onglet révoqué n'avait RIEN dit : coquille vide, aucune
 * invitation à se reconnecter. L'avis est bloquant, il dit pourquoi, et le
 * chiffre du plafond vient de la constante partagée — jamais écrit en dur.
 */
describe('SessionRevokedNotice', () => {
  beforeEach(() => {
    mocks.navigate.mockReset()
    mocks.acknowledge.mockReset()
    mocks.sessionRevoked = true
    mocks.pathname = '/accounts'
  })

  it('bloque l’écran, dit pourquoi, avec le plafond lu dans la constante partagée', () => {
    render(<SessionRevokedNotice />)

    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog.textContent).toContain(String(MAX_ACTIVE_DEVICES))
    // Des libellés, pas des clés i18n.
    expect(dialog.textContent).not.toMatch(/sessionRevoked\./)
  })

  it('« Me reconnecter » acquitte l’avis et mène à la connexion', () => {
    render(<SessionRevokedNotice />)

    fireEvent.click(screen.getByRole('button'))

    expect(mocks.acknowledge).toHaveBeenCalledTimes(1)
    expect(mocks.navigate).toHaveBeenCalledWith({ to: '/login', replace: true })
  })

  it('NON — sans révocation, rien ne s’affiche', () => {
    mocks.sessionRevoked = false
    const { container } = render(<SessionRevokedNotice />)
    expect(container).toBeEmptyDOMElement()
  })

  // 29/09/2026 — l'avis bloquait le formulaire d'entrée en démo.
  it.each(['/demo/acces', '/demo', '/login', '/signup'])('NON — jamais sur la route publique %s', pathname => {
    mocks.pathname = pathname
    const { container } = render(<SessionRevokedNotice />)
    expect(container).toBeEmptyDOMElement()
  })
})
