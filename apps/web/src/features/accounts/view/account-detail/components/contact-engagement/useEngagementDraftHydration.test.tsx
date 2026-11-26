import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }))

import { createEngagementDraftStore } from './draft-store'
import { useEngagementDraftHydration } from './useEngagementDraftHydration'

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
}

describe('useEngagementDraftHydration (#3694.7)', () => {
  beforeEach(() => apiFetch.mockReset())

  it('pose le brouillon reçu du serveur dans le magasin, et rend « hydraté »', async () => {
    apiFetch.mockResolvedValue({
      entries: [{ id: 'a1', role: 'user', text: 'Angle' }],
      context: 'ctx',
      parameters: { objective: 'relance' },
    })
    const drafts = createEngagementDraftStore()
    const { result } = renderHook(() => useEngagementDraftHydration(drafts, 'c1', 'email'), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.hydrated).toBe(true))
    expect(drafts.get('c1:email')).toEqual({
      entries: [{ id: 'a1', role: 'user', text: 'Angle' }],
      context: 'ctx',
      parameters: { objective: 'relance' },
    })
  })

  it("n'écrase jamais un brouillon déjà tapé avant que la réponse n'arrive", async () => {
    apiFetch.mockResolvedValue({ entries: [], context: 'du serveur', parameters: {} })
    const drafts = createEngagementDraftStore()
    const typed = { entries: [], context: 'déjà tapé', parameters: {} }
    drafts.set('c1:email', typed)
    const { result } = renderHook(() => useEngagementDraftHydration(drafts, 'c1', 'email'), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.hydrated).toBe(true))
    expect(drafts.get('c1:email')).toEqual(typed)
  })

  it('aucun brouillon côté serveur (null) ⇒ hydraté quand même, rien dans le magasin', async () => {
    apiFetch.mockResolvedValue(null)
    const drafts = createEngagementDraftStore()
    const { result } = renderHook(() => useEngagementDraftHydration(drafts, 'c1', 'email'), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.hydrated).toBe(true))
    expect(drafts.get('c1:email')).toBeUndefined()
  })

  it('sans magasin de brouillons (appelant historique) : hydraté tout de suite, aucun appel réseau', () => {
    const { result } = renderHook(() => useEngagementDraftHydration(undefined, 'c1', 'email'), { wrapper: wrapper() })
    expect(result.current.hydrated).toBe(true)
    expect(apiFetch).not.toHaveBeenCalled()
  })
})
