import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as ContactsApiModule from '@/features/contacts/api'
import { ApiError } from '@/lib/api-error'

/**
 * #1935.25 — LA RELECTURE DES FICHES DE L'AUDIENCE.
 *
 * Ce hook est l'APPELANT réel : il relit chaque contact annoncé par l'URL, et
 * traduit ce que le serveur répond dans le vocabulaire de `campaignAudience`.
 * Ce qu'il protège, et que la fonction pure ne peut pas protéger seule :
 *
 *  · un 404 (« cette fiche n'est pas dans ton portefeuille ») ne se confond pas
 *    avec un 500 (« je n'ai pas pu lire ») — le premier est un FAIT, le second
 *    un aveu d'ignorance ;
 *  · sans identifiant, AUCUN appel réseau ne part (no-op strict).
 */
const getOne = vi.fn()

vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u-1' }, loading: false }) }))
vi.mock('@/features/contacts/api', async importOriginal => {
  const actual = await importOriginal<typeof ContactsApiModule>()
  return { ...actual, contactsApi: { ...actual.contactsApi, getOne: (id: string) => getOne(id) } }
})

const { useCampaignAudience } = await import('./useCampaignAudience')

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function contact(over: Record<string, unknown> = {}) {
  return { id: 'c-1', full_name: 'Marie Dubois', title: 'DSI', email: 'marie@nova.fr', ...over }
}

beforeEach(() => {
  getOne.mockReset()
})

describe('useCampaignAudience', () => {
  it('relit chaque fiche annoncée et rend l’audience dans l’ordre des identifiants', async () => {
    getOne.mockImplementation((id: string) =>
      Promise.resolve(contact({ id, full_name: id === 'c-1' ? 'Marie Dubois' : 'Alain Roche' })),
    )
    const { result } = renderHook(() => useCampaignAudience(['c-1', 'c-2']), { wrapper })
    await waitFor(() => expect(result.current.pending).toBe(0))
    expect(result.current.eligible.map(c => c.full_name)).toEqual(['Marie Dubois', 'Alain Roche'])
    expect(result.current.dropped).toEqual([])
  })

  it('un contact absent du portefeuille (404) est écarté comme INTROUVABLE', async () => {
    getOne.mockRejectedValue(new ApiError('Contact not found', 404))
    const { result } = renderHook(() => useCampaignAudience(['c-404']), { wrapper })
    await waitFor(() => expect(result.current.pending).toBe(0))
    expect(result.current.dropped).toEqual([{ id: 'c-404', fullName: null, reason: 'missing', detail: null }])
  })

  it('une lecture EN ÉCHEC ne se dit pas « introuvable » — on sait seulement qu’on ne sait pas', async () => {
    getOne.mockRejectedValue(new ApiError('Boom', 500))
    const { result } = renderHook(() => useCampaignAudience(['c-7']), { wrapper })
    await waitFor(() => expect(result.current.pending).toBe(0))
    expect(result.current.dropped[0]?.reason).toBe('unreadable')
  })

  it('sans identifiant : aucun appel réseau, aucune audience, aucune attente', () => {
    const { result } = renderHook(() => useCampaignAudience([]), { wrapper })
    expect(getOne).not.toHaveBeenCalled()
    expect(result.current).toEqual({ eligible: [], dropped: [], pending: 0 })
  })

  it('un contact écarté est relu comme tel — le hook ne refait pas le tri, il le transmet', async () => {
    getOne.mockResolvedValue(
      contact({ excluded_at: '2026-09-01T09:00:00.000Z', exclusion_reason: 'a quitté l’entreprise' }),
    )
    const { result } = renderHook(() => useCampaignAudience(['c-1']), { wrapper })
    await waitFor(() => expect(result.current.pending).toBe(0))
    expect(result.current.eligible).toEqual([])
    expect(result.current.dropped[0]).toMatchObject({ reason: 'opted_out', detail: 'a quitté l’entreprise' })
  })
})
