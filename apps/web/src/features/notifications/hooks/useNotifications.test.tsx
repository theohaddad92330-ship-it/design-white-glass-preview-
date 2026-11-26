import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from '@/lib/api'
import { useNotifications } from './useNotifications'

const apiFetchMock = vi.mocked(apiFetch)

vi.mock('@/lib/hooks/use-session', () => ({
  useSession: () => ({ user: { id: 'u-1', email: 'u@example.com' }, loading: false }),
}))

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

/**
 * #2136 — mesuré en production : `GET /notifications/unread-count` a rendu
 * 401 pour un utilisateur connecté qui naviguait normalement, et le front
 * l'avalait en silence (`unread.data?.count ?? 0`). La cloche affichait donc
 * « 0 non lu » au lieu de « je n'ai pas pu compter » — deux affirmations
 * opposées, et l'utilisateur agit différemment selon laquelle est vraie.
 *
 * Ce fichier verrouille les TROIS états, jamais confondus : mesuré (un vrai
 * nombre, y compris zéro), non mesuré (le sondage a échoué) et en cours de
 * chargement (la première réponse n'est pas encore arrivée).
 */
describe('useNotifications — non mesuré n’est jamais 0 (#2136)', () => {
  beforeEach(() => {
    apiFetchMock.mockReset()
  })

  it('la mesure ÉCHOUE (401) : unreadCount reste null, jamais 0 — le statut dit « unknown »', async () => {
    apiFetchMock.mockImplementation(({ path }: { path: string }) => {
      if (path === '/notifications/unread-count') return Promise.reject(new Error('401 Unauthorized'))
      return Promise.resolve({ data: [], total: 0 })
    })

    const { result } = renderHook(() => useNotifications(), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.unreadCountStatus).toBe('unknown'))
    // La régression EXACTE : ne jamais afficher un zéro fabriqué.
    expect(result.current.unreadCount).toBeNull()
  })

  it('la mesure RÉUSSIT à zéro : unreadCount vaut 0, un VRAI zéro — le statut dit « measured »', async () => {
    apiFetchMock.mockImplementation(({ path }: { path: string }) => {
      if (path === '/notifications/unread-count') return Promise.resolve({ count: 0 })
      return Promise.resolve({ data: [], total: 0 })
    })

    const { result } = renderHook(() => useNotifications(), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.unreadCountStatus).toBe('measured'))
    expect(result.current.unreadCount).toBe(0)
  })

  it('avant la première réponse : le statut dit « loading », pas « measured »', () => {
    apiFetchMock.mockImplementation(({ path }: { path: string }) => {
      if (path === '/notifications/unread-count') return new Promise(() => {}) // never resolves
      return Promise.resolve({ data: [], total: 0 })
    })

    const { result } = renderHook(() => useNotifications(), { wrapper: wrapper() })

    expect(result.current.unreadCountStatus).toBe('loading')
    expect(result.current.unreadCount).toBeNull()
  })
})

/**
 * #2144.27 (épopée #2928) — PAS DEUX ALERTES IDENTIQUES SANS CONSOLIDATION.
 *
 * `useNotifications` est le SEUL endroit qui lit la liste (cloche ET bulle de
 * Laura, GA-26) : consolider ici ferme le manque aux deux endroits nommés par
 * la vérification du 25/09 (`NotificationBell`/`LauraCard`) d'un seul geste.
 */
describe('useNotifications — consolide les alertes identiques (#2144.27)', () => {
  beforeEach(() => {
    apiFetchMock.mockReset()
  })

  it('fusionne deux alertes du même type et du même lien, toutes deux non lues', async () => {
    apiFetchMock.mockImplementation(({ path }: { path: string }) => {
      if (path === '/notifications/unread-count') return Promise.resolve({ count: 2 })
      return Promise.resolve({
        data: [
          {
            id: 'a',
            type: 'buy_signal',
            title: 'Signal',
            body: '',
            link: '/accounts/acc-1',
            read_at: null,
            created_at: '2026-09-27T08:00:00.000Z',
            level: null,
            source: null,
          },
          {
            id: 'b',
            type: 'buy_signal',
            title: 'Signal',
            body: '',
            link: '/accounts/acc-1',
            read_at: null,
            created_at: '2026-09-27T10:00:00.000Z',
            level: null,
            source: null,
          },
        ],
        total: 2,
      })
    })

    const { result } = renderHook(() => useNotifications(), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.notifications).toHaveLength(1))
    expect(result.current.notifications[0]?.id).toBe('b')
    expect(result.current.notifications[0]?.occurrences).toBe(2)
  })
})
