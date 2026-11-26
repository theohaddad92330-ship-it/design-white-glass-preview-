import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #5024.2 — un onglet NEUF, sans marqueur démo, ne reste pas dans la démo d'un autre onglet
 * (cookie partagé) : le statut serveur « démo » le fait sortir, sur n'importe quelle page.
 */
const h = vi.hoisted(() => ({
  exit: vi.fn(),
  isTabDemo: vi.fn(),
  demoSpace: 'real' as 'demo' | 'real' | 'unknown',
  user: null as { id: string } | null,
  impersonation: null as { email: string; by: string; exp: number } | null,
}))

vi.mock('@/features/auth/hooks/useExitDemo', () => ({ useExitDemo: () => ({ exit: h.exit, isPending: false }) }))
vi.mock('@/features/auth/demo-tab', () => ({ isTabDemo: h.isTabDemo }))
vi.mock('@/features/demo/useIsDemo', () => ({ useDemoSpaceStatus: () => h.demoSpace }))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: h.user, loading: false }) }))
vi.mock('@/features/impersonation/impersonation-state', () => ({ readImpersonationState: () => h.impersonation }))

import { useLeaveForeignDemo } from './useLeaveForeignDemo'

describe('useLeaveForeignDemo (#5024.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.exit.mockResolvedValue(undefined)
    h.user = { id: 'u' }
    h.isTabDemo.mockReturnValue(false)
    h.demoSpace = 'demo'
    h.impersonation = null
  })

  it('E2 — impersonation admin + démo serveur + pas de marqueur d’onglet : on reste', () => {
    h.impersonation = { email: 'client@exemple.fr', by: 'admin', exp: 0 }
    renderHook(() => useLeaveForeignDemo())
    expect(h.exit).not.toHaveBeenCalled()
  })

  it('onglet sans marqueur + le serveur dit démo : sort de la démo', async () => {
    renderHook(() => useLeaveForeignDemo())
    await waitFor(() => expect(h.exit).toHaveBeenCalledTimes(1))
  })

  it('onglet qui porte le marqueur : reste en démo', () => {
    h.isTabDemo.mockReturnValue(true)
    renderHook(() => useLeaveForeignDemo())
    expect(h.exit).not.toHaveBeenCalled()
  })

  it('REFUS : sans session, ou serveur non démo / inconnu : aucune sortie, aucun espace exposé', () => {
    h.user = null
    renderHook(() => useLeaveForeignDemo())
    h.user = { id: 'u' }
    h.demoSpace = 'real'
    renderHook(() => useLeaveForeignDemo())
    h.demoSpace = 'unknown'
    renderHook(() => useLeaveForeignDemo())
    expect(h.exit).not.toHaveBeenCalled()
  })
})
