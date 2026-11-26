import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.fn()
vi.mock('@/lib/api', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiFetch: (...a: unknown[]) => apiFetch(...a),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { contactKeys } from '@/features/contacts/api'
import { useUpdateContactStatus } from './useUpdateContactStatus'

beforeEach(() => {
  apiFetch.mockReset()
})

/** #16 — après le choix d'un statut, la fiche ouverte montre le nouveau tout de suite, et revient si le serveur refuse. */
describe('useUpdateContactStatus — fiche ouverte', () => {
  const setup = () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    qc.setQueryData(contactKeys.detail('c-1'), {
      id: 'c-1',
      user_status: 'new',
      relation_badge: { derived: 'to_contact', declared: null, shown: { source: 'derived', relation: 'to_contact' } },
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    )
    return { qc, wrapper }
  }

  it('écrit le nouveau statut dans la fiche AVANT la réponse du serveur', async () => {
    const { qc, wrapper } = setup()
    apiFetch.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useUpdateContactStatus(), { wrapper })
    act(() => result.current.mutate({ id: 'c-1', account_id: null, full_name: 'Claire', status: 'replied' }))
    await waitFor(() => {
      const detail = qc.getQueryData(contactKeys.detail('c-1')) as {
        user_status: string
        relation_badge: { shown: unknown }
      }
      expect(detail.user_status).toBe('replied')
      expect(detail.relation_badge.shown).toEqual({ source: 'declared', status: 'replied' })
    })
  })

  it('NON : un refus du serveur remet l’ancien statut', async () => {
    const { qc, wrapper } = setup()
    apiFetch.mockRejectedValue(new Error('refusé'))
    const { result } = renderHook(() => useUpdateContactStatus(), { wrapper })
    act(() => result.current.mutate({ id: 'c-1', account_id: null, full_name: 'Claire', status: 'replied' }))
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect((qc.getQueryData(contactKeys.detail('c-1')) as { user_status: string }).user_status).toBe('new')
  })
})
