import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccountListItem } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import { useAccountsStore } from '@/features/accounts/store/useAccountsStore'
import type { GlobalContact } from '@/features/contacts/api'
import { useContactsStore } from '@/features/contacts/store/useContactsStore'
import { useWorkspaces } from './useWorkspaces'

vi.mock('@/lib/api')
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/hooks/use-session', () => ({
  useSession: () => ({ user: { id: 'u-1' }, loading: false }),
}))

const apiFetchMock = vi.mocked(apiFetch)

function wrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

// #2644.1 — GA-43 : le coût d'accès (et toute donnée) ne s'agrège JAMAIS entre
// espaces, ce sont des concurrents. `qc.clear()` vide le cache react-query,
// mais deux caches PERSISTÉS (localStorage, hors react-query) survivaient à la
// bascule : la liste d'espace A restait affichée sous le nom de l'espace B tant
// que le scroll infini ne l'écrasait pas.
describe('useWorkspaces — la bascule ne mélange pas deux espaces', () => {
  beforeEach(() => {
    apiFetchMock.mockReset()
    useAccountsStore.setState({ cachedAccounts: [{ id: 'acc-espace-a' } as unknown as AccountListItem] })
    useContactsStore.setState({
      cachedContacts: [{ id: 'contact-espace-a' } as unknown as GlobalContact],
      currentContact: null,
    })
    Object.defineProperty(window, 'location', {
      value: { ...window.location, assign: vi.fn() },
      writable: true,
    })
  })

  it('vide le cache de comptes ET de contacts persistés avant de naviguer', async () => {
    // La liste des espaces (`useQuery` de `listWorkspaces`) tourne dès le rendu
    // du hook, indépendamment de la mutation testée — distinguer par chemin
    // plutôt que par ordre d'appel évite un couplage fragile aux deux requêtes.
    apiFetchMock.mockImplementation(async args => {
      if (args.path === '/workspaces') return []
      return { workspaceId: 'w-2', workspaceName: 'Espace B', role: 'owner' }
    })

    const { result } = renderHook(() => useWorkspaces(), { wrapper: wrapper() })
    result.current.switchWorkspace.mutate('w-2')

    await waitFor(() => expect(result.current.switchWorkspace.isSuccess).toBe(true))

    expect(useAccountsStore.getState().cachedAccounts).toEqual([])
    expect(useContactsStore.getState().cachedContacts).toEqual([])
    expect(useContactsStore.getState().currentContact).toBeNull()
    expect(window.location.assign).toHaveBeenCalledWith('/briefing')
  })
})
