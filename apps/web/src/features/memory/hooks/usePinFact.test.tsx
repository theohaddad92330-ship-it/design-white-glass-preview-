import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from '@/lib/api'
import { usePinFact } from './usePinFact'

const apiFetchMock = vi.mocked(apiFetch)

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('usePinFact', () => {
  beforeEach(() => apiFetchMock.mockReset())

  it('POSTs the fact scoped to the active account', async () => {
    apiFetchMock.mockResolvedValueOnce({
      fact: { id: 'f-1', fact: 'DSI décideur', accountId: 'a-1', createdAt: 'now' },
    })
    const { result } = renderHook(() => usePinFact(), { wrapper: wrapper() })
    result.current.mutate({ fact: 'DSI décideur', accountId: 'a-1' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(apiFetchMock).toHaveBeenCalledWith({
      path: '/memory/facts',
      method: 'POST',
      body: { fact: 'DSI décideur', accountId: 'a-1' },
    })
  })

  it('omits accountId from the body for a workspace-global fact', async () => {
    apiFetchMock.mockResolvedValueOnce({
      fact: { id: 'f-2', fact: 'Cible: banques', accountId: null, createdAt: 'now' },
    })
    const { result } = renderHook(() => usePinFact(), { wrapper: wrapper() })
    result.current.mutate({ fact: 'Cible: banques' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(apiFetchMock).toHaveBeenCalledWith({
      path: '/memory/facts',
      method: 'POST',
      body: { fact: 'Cible: banques' },
    })
  })

  // ── MemoryItem complet (restitution V2 §20) ────────────────────────────────
  it('sends the nature and the deadline when the user chose them', async () => {
    apiFetchMock.mockResolvedValueOnce({
      fact: { id: 'f-3', fact: 'Pas de régie', accountId: null, createdAt: 'now' },
    })
    const { result } = renderHook(() => usePinFact(), { wrapper: wrapper() })
    result.current.mutate({ fact: 'Pas de régie', kind: 'correction', expiresAt: '2026-12-31T23:59:59.999Z' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(apiFetchMock).toHaveBeenCalledWith({
      path: '/memory/facts',
      method: 'POST',
      body: { fact: 'Pas de régie', kind: 'correction', expiresAt: '2026-12-31T23:59:59.999Z' },
    })
  })

  it('#1917.3 — sends the scope the screen chose', async () => {
    apiFetchMock.mockResolvedValueOnce({
      fact: { id: 'f-5', fact: 'Objectif perso', accountId: null, createdAt: 'now' },
    })
    const { result } = renderHook(() => usePinFact(), { wrapper: wrapper() })
    result.current.mutate({ fact: 'Objectif perso', scope: 'user' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(apiFetchMock).toHaveBeenCalledWith({
      path: '/memory/facts',
      method: 'POST',
      body: { fact: 'Objectif perso', scope: 'user' },
    })
  })

  it('omits an unset nature/deadline so the server keeps its historical defaults', async () => {
    apiFetchMock.mockResolvedValueOnce({ fact: { id: 'f-4', fact: 'x', accountId: null, createdAt: 'now' } })
    const { result } = renderHook(() => usePinFact(), { wrapper: wrapper() })
    result.current.mutate({ fact: 'x', kind: undefined, expiresAt: null })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(apiFetchMock).toHaveBeenCalledWith({ path: '/memory/facts', method: 'POST', body: { fact: 'x' } })
  })
})
