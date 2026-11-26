import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #3788 (recette 06/10) — après une salle démo, /login + « Se connecter »
 * rouvrait la session démo : l'identité fictive était encore posée, donc le
 * rebond post-connexion repartait dedans. /login ferme la démo AVANT tout.
 */
const h = vi.hoisted(() => ({
  logout: vi.fn(),
  clearVolatileUserState: vi.fn(),
  endVoluntaryExit: vi.fn(),
  isTabDemo: vi.fn(),
  demoSpace: 'real' as 'demo' | 'real' | 'unknown',
  user: null as { id: string } | null,
}))

vi.mock('@/features/auth/session-manager', () => ({ sessionManager: { logout: h.logout } }))
vi.mock('@/features/auth/demo-tab', () => ({ isTabDemo: h.isTabDemo }))
vi.mock('@/features/auth/lib/pre-login-target', () => ({ endVoluntaryExit: h.endVoluntaryExit }))
vi.mock('@/features/auth/clear-client-user-state', () => ({ clearVolatileUserState: h.clearVolatileUserState }))
vi.mock('@/features/demo/useIsDemo', () => ({ useDemoSpaceStatus: () => h.demoSpace }))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: h.user, loading: false }) }))

import { useCloseDemoOnLogin } from './useCloseDemoOnLogin'

describe('useCloseDemoOnLogin (#3788)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.logout.mockResolvedValue(undefined)
    h.user = null
    h.isTabDemo.mockReturnValue(false)
    h.demoSpace = 'real'
  })

  it('onglet démo + session posée : ferme la démo, vide le cache, puis libère le formulaire', async () => {
    h.user = { id: 'demo-user' }
    h.isTabDemo.mockReturnValue(true)
    const { result } = renderHook(() => useCloseDemoOnLogin())
    expect(result.current.closing).toBe(true)
    await waitFor(() => expect(result.current.closing).toBe(false))
    expect(h.logout).toHaveBeenCalledTimes(1)
    expect(h.clearVolatileUserState).toHaveBeenCalledTimes(1)
    expect(h.endVoluntaryExit).toHaveBeenCalledTimes(1)
  })

  // #3788.6 — recette prod 08/10 : `qc.clear()` seul ne vide pas le scroll
  // infini des comptes/contacts (localStorage, hors de react-query) ; le
  // compte réel qui se reconnecte ici doit repartir d'un cache VRAIMENT vide.
  it('vide aussi le scroll infini des comptes et des contacts (pas seulement react-query)', async () => {
    h.user = { id: 'demo-user' }
    h.isTabDemo.mockReturnValue(true)
    const { result } = renderHook(() => useCloseDemoOnLogin())
    await waitFor(() => expect(result.current.closing).toBe(false))
    expect(h.clearVolatileUserState).toHaveBeenCalledTimes(1)
  })

  it('un échec du serveur ne bloque pas le formulaire', async () => {
    h.user = { id: 'demo-user' }
    h.isTabDemo.mockReturnValue(true)
    h.logout.mockRejectedValue(new Error('réseau'))
    const { result } = renderHook(() => useCloseDemoOnLogin())
    await waitFor(() => expect(result.current.closing).toBe(false))
  })

  it('sait dire NON : un vrai compte (onglet non démo) n’est jamais déconnecté', () => {
    h.user = { id: 'real-user' }
    const { result } = renderHook(() => useCloseDemoOnLogin())
    expect(result.current.closing).toBe(false)
    expect(h.logout).not.toHaveBeenCalled()
  })

  it('sait dire NON : visiteur anonyme dans un onglet démo, rien à fermer', () => {
    h.isTabDemo.mockReturnValue(true)
    const { result } = renderHook(() => useCloseDemoOnLogin())
    expect(result.current.closing).toBe(false)
    expect(h.logout).not.toHaveBeenCalled()
  })

  it('ne ferme qu’une fois même si la session republie', async () => {
    h.user = { id: 'demo-user' }
    h.isTabDemo.mockReturnValue(true)
    const { rerender } = renderHook(() => useCloseDemoOnLogin())
    await act(async () => {
      rerender()
    })
    expect(h.logout).toHaveBeenCalledTimes(1)
  })

  // #5024 — régression de #3788 (retour client du 29/10) : la démo ouverte dans un AUTRE onglet laisse
  // son cookie ; cet onglet-ci n'a pas le marqueur (sessionStorage vide), le serveur lui sert la session
  // démo, et le rebond post-connexion repartait dedans. C'est `is_demo` du SERVEUR qui décide.
  describe('#5024 — la démo ouverte dans un autre onglet', () => {
    it('onglet sans marqueur mais le serveur dit démo : ferme la salle de CET onglet seulement', async () => {
      h.user = { id: 'demo-user' }
      h.demoSpace = 'demo'
      const { result } = renderHook(() => useCloseDemoOnLogin())
      expect(result.current.closing).toBe(true)
      await waitFor(() => expect(result.current.closing).toBe(false))
      expect(h.logout).toHaveBeenCalledTimes(1)
      // #4608 — une session réelle ouverte à côté survit : on ne ferme que l'identité de l'onglet.
      expect(h.logout).toHaveBeenCalledWith({ scope: 'tab' })
      expect(h.clearVolatileUserState).toHaveBeenCalledTimes(1)
    })

    it('tant que le serveur n’a pas dit si l’espace est démo, le rebond est retenu (sans rien fermer)', () => {
      h.user = { id: 'someone' }
      h.demoSpace = 'unknown'
      const { result } = renderHook(() => useCloseDemoOnLogin())
      expect(result.current.checking).toBe(true)
      expect(result.current.closing).toBe(false)
      expect(h.logout).not.toHaveBeenCalled()
    })

    it('sait dire NON : le serveur dit espace réel → ni fermeture ni attente', () => {
      h.user = { id: 'real-user' }
      h.demoSpace = 'real'
      const { result } = renderHook(() => useCloseDemoOnLogin())
      expect(result.current.closing).toBe(false)
      expect(result.current.checking).toBe(false)
      expect(h.logout).not.toHaveBeenCalled()
    })

    it('sait dire NON : visiteur non connecté → rien à fermer, la démo reste accessible', () => {
      h.user = null
      h.demoSpace = 'unknown'
      const { result } = renderHook(() => useCloseDemoOnLogin())
      expect(result.current.closing).toBe(false)
      expect(result.current.checking).toBe(false)
      expect(h.logout).not.toHaveBeenCalled()
    })
  })
})
