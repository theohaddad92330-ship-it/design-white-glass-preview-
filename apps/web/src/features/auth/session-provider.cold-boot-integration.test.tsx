import { render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * G02.1 — PRIORITÉ recette prod 09/10 : « toute navigation complète par URL
 * (rechargement, lien collé) renvoie à /login et il faut cliquer DEUX fois
 * sur « Se connecter » ; la session ne survit qu'à la navigation interne. »
 *
 * Chaque brique (`SessionManager.loadSession`, `RedirectTo`, la sonde
 * d'origine) a déjà son test UNITAIRE, mocké isolément — et tous passent
 * (voir `session-manager.test.ts`, `RedirectTo.test.tsx`,
 * `session-provider.boot.test.tsx`). Ce qui manquait : un test qui monte le
 * CÂBLAGE réel d'un démarrage à froid (nouvel onglet, module neuf) — exactement
 * ce qu'un rechargement ou un lien collé déclenche, et qu'un test unitaire de
 * chaque pièce ne peut pas trahir. Sait dire NON : un cookie d'accès valide
 * qui atterrit sur un `<RedirectTo to="/login" />` ferait échouer ce test.
 */
const navigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))

const sessionCall = vi.fn()
const refreshCall = vi.fn()
vi.mock('./api', () => ({
  authApi: {
    session: () => sessionCall(),
    refresh: () => refreshCall(),
  },
}))

// La sonde d'origine (passerelle d'entreprise) est hors-sujet ici : un no-op
// évite un vrai `fetch` réseau dans jsdom pendant que le test mesure autre chose.
vi.mock('@/lib/api-origin', () => ({ ensureApiReachable: () => Promise.resolve() }))

const USER = { id: 'u1', email: 'sales@esn.fr', created_at: 'now', roles: ['customer'] }

describe('G02.1 — démarrage à froid avec cookie valide → page demandée, jamais /login', () => {
  beforeEach(() => {
    vi.resetModules()
    sessionCall.mockReset()
    refreshCall.mockReset()
    navigate.mockClear()
  })

  afterEach(() => {
    vi.doUnmock('./logged-in-cookie')
  })

  it('sentinelle lisible + cookie d’accès valide : la page demandée s’ouvre sans jamais passer par /login', async () => {
    vi.doMock('./logged-in-cookie', () => ({ hasLoggedInCookie: () => true }))
    sessionCall.mockResolvedValue({ user: USER })

    const { RedirectTo } = await import('@/components/navigation/RedirectTo')
    const { useSession } = await import('@/lib/hooks/use-session')
    const { SessionProvider } = await import('./session-provider')

    // Le même garde que `CustomerPageContent`, `SettingsPage`, `BackofficePage` :
    // `!user` ⇒ `/login`, sinon la page demandée.
    function RequestedPage() {
      const { user } = useSession()
      if (!user) return <RedirectTo to="/login" />
      return <div>Page demandée — compte {user.email}</div>
    }

    const { findByText } = render(
      <SessionProvider>
        <RequestedPage />
      </SessionProvider>,
    )

    await findByText('Page demandée — compte sales@esn.fr')
    expect(navigate).not.toHaveBeenCalled()
  })

  it('sentinelle illisible (API cross-site) mais refresh valide : la page demandée s’ouvre quand même, sans /login', async () => {
    vi.doMock('./logged-in-cookie', () => ({ hasLoggedInCookie: () => false }))
    refreshCall.mockResolvedValue({ user: USER, expires_at: null })

    const { RedirectTo } = await import('@/components/navigation/RedirectTo')
    const { useSession } = await import('@/lib/hooks/use-session')
    const { SessionProvider } = await import('./session-provider')

    function RequestedPage() {
      const { user } = useSession()
      if (!user) return <RedirectTo to="/login" />
      return <div>Page demandée — compte {user.email}</div>
    }

    const { findByText } = render(
      <SessionProvider>
        <RequestedPage />
      </SessionProvider>,
    )

    await findByText('Page demandée — compte sales@esn.fr')
    expect(navigate).not.toHaveBeenCalled()
  })

  it('⚠️ SAIT DIRE NON — aucune session réelle (401 partout) : /login part, une seule fois', async () => {
    vi.doMock('./logged-in-cookie', () => ({ hasLoggedInCookie: () => false }))
    const { ApiError } = await import('@/lib/api-error')
    refreshCall.mockRejectedValue(new ApiError('unauthorized', 401))

    const { RedirectTo } = await import('@/components/navigation/RedirectTo')
    const { useSession } = await import('@/lib/hooks/use-session')
    const { SessionProvider } = await import('./session-provider')

    function RequestedPage() {
      const { user } = useSession()
      if (!user) return <RedirectTo to="/login" />
      return <div>Page demandée</div>
    }

    render(
      <SessionProvider>
        <RequestedPage />
      </SessionProvider>,
    )

    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/login', replace: true }))
    expect(navigate).toHaveBeenCalledTimes(1)
  })
})
