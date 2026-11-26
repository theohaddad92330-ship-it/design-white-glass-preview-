import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// #4630 — le rôle d'un espace PRÉCÉDENT ne décide jamais d'un onglet ni d'une entrée de menu.
// Le changement d'espace recharge la page, mais le cache persisté (IndexedDB) ressuscite
// la réponse `/workspaces/me` de l'ancien espace, rôle compris, le temps d'un rendu.
const h = vi.hoisted(() => ({ getTeam: vi.fn() }))
vi.mock('../api', () => ({ teamApi: { getTeam: h.getTeam } }))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u1' } }) }))

import { TEAM_KEY, useTeam } from './useTeam'

const team = (role: string) => ({
  workspace: { id: 'w', role },
  members: [],
  invitations: [],
  seats: { used: 0, total: 1 },
})

function wrapperFor(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

beforeEach(() => h.getTeam.mockReset())
afterEach(() => vi.useRealTimers())

describe('useTeam — rôle périmé (#4630)', () => {
  it("REFUS : une réponse restaurée du cache persisté (antérieure au chargement) n'est PAS rendue — ni le rôle, ni les membres", () => {
    let release: (value: unknown) => void = () => undefined
    h.getTeam.mockReturnValue(new Promise(resolve => (release = resolve))) // la requête fraîche n'est pas revenue
    const qc = new QueryClient()
    qc.setQueryData(TEAM_KEY, team('manager'), { updatedAt: Date.now() - 60_000 })
    const { result } = renderHook(() => useTeam(), { wrapper: wrapperFor(qc) })
    expect(result.current.team).toBeUndefined()
    // « pas encore lu » : l'appelant attend, il ne conclut pas à l'absence d'équipe.
    expect(result.current.isLoading).toBe(true)
    release(team('member'))
  })

  it('une réponse lue pendant CE chargement est rendue', async () => {
    const qc = new QueryClient()
    qc.setQueryData(TEAM_KEY, team('member'))
    h.getTeam.mockResolvedValue(team('member'))
    const { result } = renderHook(() => useTeam(), { wrapper: wrapperFor(qc) })
    expect(result.current.team?.workspace.role).toBe('member')
    expect(result.current.isLoading).toBe(false)
  })

  it('#5170 : une réponse restaurée ENCORE FRAÎCHE (staleTime non expiré) déclenche UN refetch — le chargement finit', async () => {
    h.getTeam.mockResolvedValue(team('member'))
    // Le module est chargé il y a ~10 s ; la réponse restaurée a 20 s : antérieure au chargement, mais < 30 s.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 10_000)
    const qc = new QueryClient()
    qc.setQueryData(TEAM_KEY, team('manager'), { updatedAt: Date.now() - 20_000 })
    const { result } = renderHook(() => useTeam(), { wrapper: wrapperFor(qc) })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(h.getTeam).toHaveBeenCalledTimes(1)
    expect(result.current.team?.workspace.role).toBe('member')
  })
})
