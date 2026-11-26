import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from '@/lib/api'
import { useForgetAllMemory } from './useMemoryLedger'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const apiFetchMock = vi.mocked(apiFetch)

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

/**
 * #1919 — « Tout oublier » efface d'abord les retours sur les réponses de Laura
 * (`MemoryService.forgetReplyFeedback`), et un échec à cette étape ARRÊTE le
 * geste avant toute couche : la requête échoue sans que rien ne soit parti.
 * L'écran doit donc le dire tel quel — un échec, rien d'effacé —, jamais un
 * succès ni un effacement partiel.
 */
describe('useForgetAllMemory — ce que « Tout oublier » dit après coup', () => {
  beforeEach(() => {
    apiFetchMock.mockReset()
    vi.mocked(toast.success).mockReset()
    vi.mocked(toast.error).mockReset()
  })

  it('une requête en échec se dit « Rien n’a été effacé. », jamais un succès ni un effacement partiel', async () => {
    apiFetchMock.mockRejectedValueOnce(new Error('chat_reply_feedback indisponible'))
    const { result } = renderHook(() => useForgetAllMemory(), { wrapper: wrapper() })

    result.current.mutate()

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(toast.error).toHaveBeenCalledTimes(1)
    expect(vi.mocked(toast.error).mock.calls[0]?.[0]).toBe("Rien n'a été effacé.")
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('les retours effacés comptent dans ce qui est parti', async () => {
    // 3 retours sur les réponses + 1 fait épinglé : le serveur rend le total.
    apiFetchMock.mockResolvedValueOnce({ forgotten: 4, failedLayers: [] })
    const { result } = renderHook(() => useForgetAllMemory(), { wrapper: wrapper() })

    result.current.mutate()

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(apiFetchMock).toHaveBeenCalledWith({ path: '/memory/ledger', method: 'DELETE' })
    expect(toast.success).toHaveBeenCalledWith('4 lignes oubliées.')
    expect(toast.error).not.toHaveBeenCalled()
  })
})
