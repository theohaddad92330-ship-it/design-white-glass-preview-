import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #3788.6 (recette prod 08/10) — « Quitter la démonstration » ne vidait que le
 * cache react-query (`qc.clear()`). Le scroll infini des comptes et des
 * contacts (`useAccountsStore`/`useContactsStore`) persiste sa page courante
 * en localStorage, HORS de portée de react-query : un compte réel qui se
 * reconnecte ensuite dans ce même navigateur voyait les dossiers démo au
 * premier rendu, le temps que le scroll infini les réécrive.
 */
const h = vi.hoisted(() => ({
  logout: vi.fn(),
  clearVolatileUserState: vi.fn(),
  endVoluntaryExit: vi.fn(),
}))

vi.mock('@/features/auth/session-manager', () => ({ sessionManager: { logout: h.logout } }))
vi.mock('@/features/auth/lib/pre-login-target', () => ({ endVoluntaryExit: h.endVoluntaryExit }))
vi.mock('@/features/auth/clear-client-user-state', () => ({ clearVolatileUserState: h.clearVolatileUserState }))

import { rememberPreDemoIdentity } from '../pre-demo-identity'
import { readTabIdentity } from '../tab-identity'
import { useExitDemo } from './useExitDemo'

const assign = vi.fn()

beforeEach(() => {
  window.sessionStorage.clear()
  vi.clearAllMocks()
  h.logout.mockResolvedValue(undefined)
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { assign, href: 'http://localhost/chat' },
  })
})

describe('useExitDemo (#3788.6)', () => {
  it('ferme la session, vide le cache comptes/contacts ET react-query, puis navigue en dur vers /login', async () => {
    const { result } = renderHook(() => useExitDemo())
    await act(async () => {
      await result.current.exit()
    })
    expect(h.logout).toHaveBeenCalledTimes(1)
    expect(h.clearVolatileUserState).toHaveBeenCalledTimes(1)
    expect(h.endVoluntaryExit).toHaveBeenCalledTimes(1)
    expect(assign).toHaveBeenCalledWith('/login')
    // L'ordre compte : vider le cache APRÈS la navigation ne protégerait rien.
    expect(h.clearVolatileUserState.mock.invocationCallOrder[0]).toBeLessThan(assign.mock.invocationCallOrder[0])
  })

  it('un échec réseau du logout ne bloque pas la sortie (le marqueur démo est déjà retiré côté client)', async () => {
    h.logout.mockRejectedValue(new Error('réseau'))
    const { result } = renderHook(() => useExitDemo())
    await act(async () => {
      await result.current.exit()
    })
    expect(h.clearVolatileUserState).toHaveBeenCalledTimes(1)
    expect(assign).toHaveBeenCalledWith('/login')
  })

  // #4608 — ouvrir la démonstration ne coûte pas la session réelle.
  describe('#4608 — la sortie rend la session réelle', () => {
    const REAL = '11111111-1111-4111-8111-111111111111'

    it("ramène l'onglet à son identité d'avant, jamais sur /login, et ne ferme que la salle", async () => {
      rememberPreDemoIdentity(REAL)
      const { result } = renderHook(() => useExitDemo())
      await act(async () => {
        await result.current.exit()
      })
      expect(h.logout).toHaveBeenCalledWith({ scope: 'tab' })
      expect(readTabIdentity()).toBe(REAL)
      expect(assign).toHaveBeenCalledTimes(1)
      expect(assign).toHaveBeenCalledWith('/')
      expect(assign).not.toHaveBeenCalledWith('/login')
    })

    it("REFUS : un onglet qui n'avait aucune session avant la démo ne s'en voit pas inventer une", async () => {
      const { result } = renderHook(() => useExitDemo())
      await act(async () => {
        await result.current.exit()
      })
      expect(readTabIdentity()).toBeNull()
      expect(assign).toHaveBeenCalledWith('/login')
    })

    it("REFUS : l'identité d'avant ne sert qu'une fois (une 2e sortie ne ressuscite pas une session)", async () => {
      rememberPreDemoIdentity(REAL)
      const { result } = renderHook(() => useExitDemo())
      await act(async () => {
        await result.current.exit()
      })
      assign.mockClear()
      await act(async () => {
        await result.current.exit()
      })
      expect(assign).toHaveBeenCalledWith('/login')
    })
  })
})
