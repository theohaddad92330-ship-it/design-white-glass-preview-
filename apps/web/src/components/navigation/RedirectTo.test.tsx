import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { markTabAsDemo } from '@/features/auth/demo-tab'

const navigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))

const session = vi.hoisted(() => ({ state: { user: null as unknown, sessionUnavailable: false } }))
vi.mock('@/features/auth/session-manager', () => ({
  sessionManager: { subscribe: () => () => undefined, getState: () => session.state },
}))

const { RedirectTo } = await import('./RedirectTo')

/**
 * Le défaut mesuré en production : `<Navigate>` compare l'identité de l'objet
 * props, que JSX recrée à chaque rendu. Sur la seule transition
 * `/` → `/dashboard`, 106 erreurs React #185 avant que la transition ne commite.
 */
describe('RedirectTo — une redirection part une seule fois', () => {
  it('ne navigue qu’UNE fois, même après dix rendus', () => {
    navigate.mockClear()
    const { rerender } = render(<RedirectTo to="/dashboard" />)
    for (let i = 0; i < 10; i += 1) rerender(<RedirectTo to="/dashboard" />)
    expect(navigate).toHaveBeenCalledTimes(1)
  })

  it('remplace l’entrée d’historique par défaut', () => {
    // Sans `replace`, le bouton « retour » renvoie sur l'écran qui redirige,
    // qui redirige à nouveau : l'utilisateur ne peut plus revenir.
    navigate.mockClear()
    render(<RedirectTo to="/login" />)
    expect(navigate).toHaveBeenCalledWith({ to: '/login', replace: true })
  })

  it('repart quand la destination CHANGE', () => {
    // Le cas réel : une session qui tombe pendant qu'on est redirigé ailleurs.
    navigate.mockClear()
    const { rerender } = render(<RedirectTo to="/dashboard" />)
    rerender(<RedirectTo to="/login" />)
    expect(navigate).toHaveBeenCalledTimes(2)
    expect(navigate).toHaveBeenLastCalledWith({ to: '/login', replace: true })
  })
})

/**
 * Constat production du 27/09/2026 : un visiteur de la démonstration qui
 * perdait sa session (401, appareil révoqué, jeton expiré) atterrissait sur
 * `/login` — un mur pour quelqu'un qui n'a ni compte ni mot de passe. Les
 * trois gardes `!user` de l'app (`CustomerPageContent`, `SettingsPage`,
 * `BackofficePage`) passent TOUTES par `<RedirectTo to="/login" />` : c'est
 * l'unique endroit où corriger la destination (GA-26).
 */
describe('RedirectTo — un 401 en démonstration ne mène jamais à /login', () => {
  beforeEach(() => {
    navigate.mockClear()
    window.sessionStorage.clear()
  })

  it('renvoie vers /demo/acces, avec un message, quand CET onglet est en démonstration', () => {
    markTabAsDemo()
    render(<RedirectTo to="/login" />)
    expect(navigate).toHaveBeenCalledWith({ to: '/demo/acces', replace: true, search: { reason: 'expired' } })
  })

  it('garde /login pour un onglet qui n’a jamais été en démonstration', () => {
    render(<RedirectTo to="/login" />)
    expect(navigate).toHaveBeenCalledWith({ to: '/login', replace: true })
  })

  it('ne détourne QUE la destination /login — /onboarding reste /onboarding', () => {
    markTabAsDemo()
    render(<RedirectTo to="/onboarding" />)
    expect(navigate).toHaveBeenCalledWith({ to: '/onboarding', replace: true })
  })
})

describe('RedirectTo — un serveur muet n’est pas une déconnexion (#3243)', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    window.localStorage.clear()
  })

  it('session indisponible : aucun départ vers /login', () => {
    navigate.mockClear()
    session.state = { user: null, sessionUnavailable: true }
    render(<RedirectTo to="/login" />)
    expect(navigate).not.toHaveBeenCalled()
    session.state = { user: null, sessionUnavailable: false }
  })

  it('⚠️ SAIT DIRE NON — session réellement absente : /login part, et les autres destinations ne sont jamais retenues', () => {
    navigate.mockClear()
    session.state = { user: null, sessionUnavailable: false }
    render(<RedirectTo to="/login" />)
    expect(navigate).toHaveBeenCalledWith({ to: '/login', replace: true })
    navigate.mockClear()
    session.state = { user: null, sessionUnavailable: true }
    render(<RedirectTo to="/onboarding" />)
    expect(navigate).toHaveBeenCalledWith({ to: '/onboarding', replace: true })
    session.state = { user: null, sessionUnavailable: false }
  })
})
