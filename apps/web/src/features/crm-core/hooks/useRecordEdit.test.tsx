import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { accountKeys } from '@/features/accounts/api'
import { usePatchAccount } from './useRecordEdit'

/**
 * #2786/#2126.62 — une correction de fiche compte (« Assurance » → « Banque »)
 * doit invalider le contexte canonique (#2116), pas seulement la fiche.
 * `AccountCanonicalContextSection`/`IncumbentEsnCard`/`OpeningStrategyCard`/
 * `OpenAccountCard` lisent tous `useAccountIntelligenceContext`, mis en cache
 * sous `accountKeys.intelligenceContext` — sans cette invalidation, la
 * correction reste invisible sur ces écrans jusqu'à `staleTime` (5 min) ou un
 * rechargement complet, alors que la fiche, elle, se met à jour tout de
 * suite : deux vérités du même compte, le NO-GO de #2285.23.
 */
const mockPatchAccount = vi.fn()

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api')
  return {
    ...actual,
    recordsApi: { ...actual.recordsApi, patchAccount: (...args: unknown[]) => mockPatchAccount(...args) },
  }
})

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

let client: QueryClient

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('usePatchAccount — une correction invalide le contexte canonique', () => {
  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
    mockPatchAccount.mockReset()
  })

  it('invalide `accountKeys.intelligenceContext`, pas seulement la fiche', async () => {
    mockPatchAccount.mockResolvedValue({ updated: ['sector'], rejected: [] })
    client.setQueryData(accountKeys.detail('acc-1'), { id: 'acc-1', sector: 'Assurance' })
    client.setQueryData(accountKeys.intelligenceContext('acc-1'), { accountId: 'acc-1' })

    const { result } = renderHook(() => usePatchAccount('acc-1'), { wrapper })

    act(() => {
      result.current.mutate({ sector: 'Banque' })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(client.getQueryState(accountKeys.detail('acc-1'))?.isInvalidated).toBe(true)
    expect(client.getQueryState(accountKeys.intelligenceContext('acc-1'))?.isInvalidated).toBe(true)
  })
})
