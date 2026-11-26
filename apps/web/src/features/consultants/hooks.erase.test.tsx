import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

const eraseBulk = vi.fn()
vi.mock('./api', async importOriginal => ({
  ...(await importOriginal<typeof import('./api')>()),
  consultantsApi: { eraseBulk: (...args: unknown[]) => eraseBulk(...args) },
}))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u1' } }) }))

const { useDeleteConsultant, useEraseTalents } = await import('./hooks')

const ID = '11111111-1111-4111-8111-111111111111'

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const removeQueries = vi.spyOn(client, 'removeQueries')
  return {
    removeQueries,
    Wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  }
}

/**
 * #3781 — « supprimer définitivement » passe par l'effacement RGPD, une seule
 * voie : la suppression d'UNE fiche emprunte le même geste que le lot.
 */
describe('useEraseTalents / useDeleteConsultant — #3781', () => {
  beforeEach(() => eraseBulk.mockReset())

  it('envoie la sélection à l’effacement RGPD et RETIRE du cache les fiches parties', async () => {
    eraseBulk.mockResolvedValue({ erased: [ID], erased_at: '2026-10-06T10:00:00.000Z', skipped: [] })
    const { Wrapper, removeQueries } = wrapper()
    const { result } = renderHook(() => useEraseTalents(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.mutateAsync([ID])
    })

    expect(eraseBulk).toHaveBeenCalledWith([ID])
    await waitFor(() => expect(removeQueries).toHaveBeenCalledWith({ queryKey: ['consultant', ID] }))
  })

  it('supprimer UNE fiche = le même effacement, avec un lot d’un identifiant', async () => {
    eraseBulk.mockResolvedValue({ erased: [ID], erased_at: '2026-10-06T10:00:00.000Z', skipped: [] })
    const { Wrapper } = wrapper()
    const { result } = renderHook(() => useDeleteConsultant(), { wrapper: Wrapper })

    let outcome: { removed: boolean } | undefined
    await act(async () => {
      outcome = await result.current.mutateAsync(ID)
    })

    expect(eraseBulk).toHaveBeenCalledWith([ID])
    expect(outcome).toEqual({ removed: true })
  })

  it('SAIT DIRE NON : une fiche laissée en place est une ERREUR dite, jamais un succès muet', async () => {
    eraseBulk.mockResolvedValue({ erased: [], erased_at: null, skipped: [{ consultant_id: ID, reason: 'blocked' }] })
    const { Wrapper } = wrapper()
    const { result } = renderHook(() => useDeleteConsultant(), { wrapper: Wrapper })

    await expect(
      act(async () => {
        await result.current.mutateAsync(ID)
      }),
    ).rejects.toThrow(/affectation/i)
  })
})
