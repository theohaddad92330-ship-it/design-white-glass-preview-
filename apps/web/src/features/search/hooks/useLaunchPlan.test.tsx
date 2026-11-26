import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { apiFetch } from '@/lib/api'
import { useLaunchPlan } from './useLaunchPlan'

vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }))

beforeEach(() => {
  vi.mocked(apiFetch).mockReset()
})

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

// #1583 — le coût annoncé avant le clic doit être EXACTEMENT le coût débité.
// Ce hook lit `GET /analysis/launch-plan` — jamais une seconde estimation.
describe('useLaunchPlan', () => {
  it("n'interroge pas le serveur tant qu'aucun nom n'est saisi", () => {
    const fetchMock = vi.mocked(apiFetch)
    renderHook(() => useLaunchPlan({ companyName: '', enabled: true }), { wrapper })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("n'interroge pas le serveur quand enabled=false (démo, relance déjà explicite)", () => {
    const fetchMock = vi.mocked(apiFetch)
    renderHook(() => useLaunchPlan({ companyName: 'TF1', enabled: false }), { wrapper })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rend le scénario "cache_hit" avec son accountId', async () => {
    const fetchMock = vi.mocked(apiFetch)
    fetchMock.mockResolvedValue({ scenario: 'cache_hit', accountId: 'acc-1', companyName: 'TF1' })

    const { result } = renderHook(() => useLaunchPlan({ companyName: 'TF1', enabled: true, debounceMs: 0 }), {
      wrapper,
    })

    await waitFor(() =>
      expect(result.current.plan).toEqual({ scenario: 'cache_hit', accountId: 'acc-1', companyName: 'TF1' }),
    )
    expect(fetchMock.mock.calls[0]?.[0]).toMatchObject({ path: expect.stringContaining('/analysis/launch-plan') })
    expect(fetchMock.mock.calls[0]?.[0].path).toContain('company_name=TF1')
  })

  it('transmet le SIREN et le périmètre choisis, jamais le périmètre par défaut (byte-identique)', async () => {
    const fetchMock = vi.mocked(apiFetch)
    fetchMock.mockResolvedValue({ scenario: 'fresh', credits: 8 })

    renderHook(
      () =>
        useLaunchPlan({ companyName: 'TF1', siren: '123456789', scopeMode: 'france', enabled: true, debounceMs: 0 }),
      { wrapper },
    )

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const path = fetchMock.mock.calls[0]?.[0].path as string
    expect(path).toContain('siren=123456789')
    expect(path).toContain('scope_mode=france')
  })

  it('omet scope_mode pour le périmètre "groupe" (défaut) — requête byte-identique', async () => {
    const fetchMock = vi.mocked(apiFetch)
    fetchMock.mockResolvedValue({ scenario: 'fresh', credits: 8 })

    renderHook(() => useLaunchPlan({ companyName: 'TF1', scopeMode: 'groupe', enabled: true, debounceMs: 0 }), {
      wrapper,
    })

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const path = fetchMock.mock.calls[0]?.[0].path as string
    expect(path).not.toContain('scope_mode')
  })

  it("dégrade sans planter quand l'appel échoue — jamais de crash sur un réseau lent", async () => {
    const fetchMock = vi.mocked(apiFetch)
    fetchMock.mockRejectedValue(new Error('network'))

    const { result } = renderHook(() => useLaunchPlan({ companyName: 'TF1', enabled: true, debounceMs: 0 }), {
      wrapper,
    })

    await act(async () => {
      await new Promise(r => setTimeout(r, 0))
    })
    expect(result.current.plan).toBeNull()
  })
})
