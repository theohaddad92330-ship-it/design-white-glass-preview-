import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SessionContext } from '@/features/auth/session-context'

/**
 * r59 (01/11) — `/contacts/imports` rendue blanche au DEUXIÈME chargement consécutif. On monte la page deux fois
 * avec le MÊME QueryClient (le cache garde les réponses du premier passage, comme une navigation de retour) :
 * le contenu doit être là les deux fois, historique compris — jamais un état « en chargement » resté coincé.
 */
vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/features/crm-core/view/CreateContactDialog', () => ({ CreateContactDialog: () => null }))
vi.mock('@/features/target-lists/api', () => ({ useTargetLists: () => ({ data: [] }) }))
vi.mock('@/features/governance/api', () => ({
  useDuplicates: () => ({ data: [] }),
  useAutoMergedDuplicates: () => ({ data: [] }),
  usePlaceholderEmailCatchup: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/features/universal-import/api', async () => ({
  ...(await vi.importActual<object>('@/features/universal-import/api')),
  fetchUniversalImportHistory: vi.fn(() => Promise.resolve([])),
  fetchContextPackHistory: vi.fn(() => Promise.resolve([])),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to?: string }) => <a href={to}>{children}</a>,
  useSearch: () => ({}),
  useNavigate: () => vi.fn(),
}))

const { ContactsImportsSourcesPage } = await import('./ContactsImportsSourcesPage')

const tree = (client: QueryClient) => (
  <QueryClientProvider client={client}>
    <SessionContext.Provider value={{ user: null, loading: false }}>
      <ContactsImportsSourcesPage />
    </SessionContext.Provider>
  </QueryClientProvider>
)

describe('r59 — /contacts/imports au deuxième chargement', () => {
  it('monte deux fois avec le même cache : le contenu et l’historique sont là les deux fois', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const first = render(tree(client))
    expect(screen.getByTestId('imports-sources')).toBeInTheDocument()
    expect(await screen.findByText(/Ton prochain import apparaîtra ici/)).toBeInTheDocument()
    first.unmount()

    render(tree(client))
    expect(screen.getByTestId('imports-sources')).toBeInTheDocument()
    expect(await screen.findByText(/Ton prochain import apparaîtra ici/)).toBeInTheDocument()
  })
})
