/**
 * L'accueil ne détourne plus un opérateur — D34 (Louis, 28/08/2026).
 *
 * Avant : `if (hasBackofficeRole(...)) return <RedirectTo to="/bak/home" />`.
 * Le porteur du rôle n'atteignait JAMAIS son écran de démarrage ; il arrivait
 * sur une page qui disait « À implémenter. ».
 *
 * Ce fichier prouve que la destination ne dépend plus du rôle back-office, et
 * qu'aucun des deux chemins existants n'a été perdu au passage (mobile → Laura,
 * bureau → la vue de démarrage choisie dans Préférences).
 *
 * #1786 — `resolveDefaultLandingRoute` (préservé par `importOriginal`, jamais
 * réimplémenté ici) est LA dérivation que la connexion (`resolveLandingFrom`,
 * voir `post-auth-landing.test.ts`) appelle aussi. Le mock ne remplace que la
 * LECTURE de la préférence, jamais le calcul.
 */
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@bellum/contracts'
import type * as PreferencesProvider from '@/features/preferences/preferences-provider'
import { resolveDefaultLandingRoute } from '@/features/preferences/preferences-provider'

const useSession = vi.fn()
const useIsMobile = vi.fn()

vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => useSession() }))
vi.mock('@/features/mobile/useIsMobile', () => ({ useIsMobile: () => useIsMobile() }))
vi.mock('@/features/preferences/preferences-provider', async importOriginal => {
  const actual = await importOriginal<typeof PreferencesProvider>()
  return {
    ...actual,
    useReadPreferences: () => ({ defaultView: 'accounts' }),
    resolveDefaultLandingRoute: vi.fn(actual.resolveDefaultLandingRoute),
  }
})
// La destination est ce qu'on mesure : la vraie `RedirectTo` navigue et ne rend
// rien, donc elle ne pourrait rien affirmer.
vi.mock('@/components/navigation/RedirectTo', () => ({
  RedirectTo: ({ to }: { to: string }) => <div data-testid="redirect">{to}</div>,
}))
vi.mock('@/components/templates/invite-to-login/invite-to-login-page', () => ({
  InviteToLoginPage: () => <div data-testid="invite" />,
}))

const { default: HomePage } = await import('./home-page')

function user(roles: string[]): SessionUser {
  return {
    id: 'u1',
    email: 'operateur@bellum-ai.com',
    email_confirmed_at: null,
    created_at: '2026-08-28T00:00:00.000Z',
    roles,
  }
}

beforeEach(() => {
  useIsMobile.mockReturnValue(false)
})

describe("l'accueil d'un opérateur est l'accueil client", () => {
  it('un porteur du rôle back-office atterrit sur sa vue de démarrage, pas sur /bak/home', () => {
    useSession.mockReturnValue({ user: user(['customer', 'backoffice']), loading: false })
    render(<HomePage />)
    expect(screen.getByTestId('redirect')).toHaveTextContent('/accounts')
  })

  it('un opérateur qui ne porte QUE le rôle back-office atterrit au même endroit', () => {
    // Le rôle se pose à la main dans `app_metadata.roles` : rien ne garantit
    // que `customer` l'accompagne. Sans ce cas, un opérateur provisionné seul
    // retomberait sur l'écran d'invitation à se connecter.
    useSession.mockReturnValue({ user: user(['backoffice']), loading: false })
    render(<HomePage />)
    expect(screen.getByTestId('redirect')).toHaveTextContent('/accounts')
  })

  it('un client sans rôle back-office est inchangé', () => {
    useSession.mockReturnValue({ user: user(['customer']), loading: false })
    render(<HomePage />)
    expect(screen.getByTestId('redirect')).toHaveTextContent('/accounts')
  })

  it('sur mobile, tout le monde arrive chez Laura', () => {
    useIsMobile.mockReturnValue(true)
    useSession.mockReturnValue({ user: user(['customer', 'backoffice']), loading: false })
    render(<HomePage />)
    expect(screen.getByTestId('redirect')).toHaveTextContent('/chat')
  })

  it('sans session, on invite à se connecter', () => {
    useSession.mockReturnValue({ user: null, loading: false })
    render(<HomePage />)
    expect(screen.getByTestId('invite')).toBeInTheDocument()
  })

  // #1786 — GA-26 : un réglage (ici une DÉRIVATION) vit à un seul endroit.
  // Si `HomePage` recalculait `isMobile ? MOBILE_HOME : DEFAULT_VIEW_ROUTE[...]`
  // par sa propre copie plutôt que d'appeler `resolveDefaultLandingRoute`, ce
  // mock ne serait jamais invoqué et ce test échouerait — même si le résultat
  // affiché restait correct. C'est la même fonction que `resolveLandingFrom`
  // appelle côté connexion (`post-auth-landing.test.ts`).
  it('demande la destination à LA dérivation partagée avec la connexion, pas à une copie locale', () => {
    useSession.mockReturnValue({ user: user(['customer']), loading: false })
    render(<HomePage />)
    expect(resolveDefaultLandingRoute).toHaveBeenCalledWith(false, 'accounts')
  })
})
