import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api-error'
import { accountKeys } from '@/features/accounts/api'
import { useAccount } from './useAccount'

const getOne = vi.hoisted(() => vi.fn())
const listByAccount = vi.hoisted(() => vi.fn())

vi.mock('@/features/accounts/api', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/accounts/api')>()),
  accountsApi: { getOne },
}))
vi.mock('@/features/contacts/api', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/contacts/api')>()),
  contactsApi: { listByAccount },
}))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u1' } }) }))
vi.mock('@/lib/cache/idb/query-snapshots', () => ({
  saveQuerySnapshot: vi.fn(),
  useHydrateFromSnapshot: vi.fn(),
}))

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}

describe('#3550 / #3532 — a dossier opened from a list that outlived a demo re-seed', () => {
  beforeEach(() => {
    getOne.mockReset()
    listByAccount.mockReset()
    listByAccount.mockResolvedValue([])
  })

  it('a 404 marks the cached accounts lists stale so the list is refetched, not trusted', async () => {
    getOne.mockRejectedValue(new ApiError('Account not found', 404))
    const { client, wrapper } = setup()
    const listKey = [...accountKeys.list('u1'), {}]
    client.setQueryData(listKey, { pages: [] })

    renderHook(() => useAccount('6512ed25-6fdd-4227-8954-de3d56a418a8'), { wrapper })

    await waitFor(() => expect(client.getQueryState(listKey)?.isInvalidated).toBe(true))
  })

  it('another failure (network, 500) leaves the lists alone', async () => {
    getOne.mockRejectedValue(new ApiError('boom', 500))
    const { client, wrapper } = setup()
    const listKey = [...accountKeys.list('u1'), {}]
    client.setQueryData(listKey, { pages: [] })

    const { result } = renderHook(() => useAccount('6512ed25-6fdd-4227-8954-de3d56a418a8'), { wrapper })

    await waitFor(() => expect(result.current.error).toBe('boom'))
    expect(client.getQueryState(listKey)?.isInvalidated).toBe(false)
  })
})
