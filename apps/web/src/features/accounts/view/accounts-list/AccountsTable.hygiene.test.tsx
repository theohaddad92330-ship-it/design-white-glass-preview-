import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionContext } from '@/features/auth/session-context'
import type { AccountHygieneByAccount } from '@/features/accounts/api'
import { AccountsTable } from './AccountsTable'
import type { AccountRow } from './types'

/**
 * LE CONTRÔLE EST-IL VRAIMENT BRANCHÉ SUR LA LIGNE ?
 *
 * Le motif qui revient dans ce dépôt est « du code juste, calculé, testé, que
 * personne n'appelle ». `AccountHygieneNotices` a ses propres tests ; ce
 * fichier-ci prouve l'autre moitié : que le tableau du portefeuille le MONTE, et
 * sur la BONNE ligne. Un composant correct qu'aucun écran ne rend est
 * exactement le défaut que ce chantier corrige.
 */

const hygiene = vi.fn()

vi.mock('@/features/accounts/api', async importOriginal => {
  const actual = await importOriginal<typeof import('@/features/accounts/api')>()
  return { ...actual, accountsApi: { ...actual.accountsApi, hygiene: () => hygiene() } }
})

function makeRow(over: Partial<AccountRow> = {}): AccountRow {
  return {
    id: 'acc-1',
    company_name: 'edf',
    sector: 'Énergie',
    priority_score: 8,
    status: 'completed',
    created_at: '2026-07-01T10:00:00.000Z',
    ...over,
  }
}

function answer(over: Partial<AccountHygieneByAccount> = {}): AccountHygieneByAccount {
  return {
    withoutNextAction: { ids: [], truncated: false },
    contactsWithoutEmail: { byAccount: {}, truncated: false },
    ...over,
  }
}

/**
 * Un harnais À CACHE NEUF, et c'est le point du fichier.
 *
 * `renderWithRouter` partage son `QueryClient` entre tous les tests d'un
 * fichier ; la lecture d'hygiène ayant un `staleTime` d'une minute, le second
 * test relisait la réponse du premier et passait au vert sans rien avoir
 * demandé au serveur. Un cache partagé transforme un test en écho du précédent.
 */
function renderTable(rows: AccountRow[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  const rootRoute = createRootRoute()
  const catchAll = createRoute({
    getParentRoute: () => rootRoute,
    path: '/$',
    component: () => (
      <QueryClientProvider client={client}>
        <SessionContext.Provider value={{ user: null, loading: false }}>
          <AccountsTable
            rows={rows}
            onDelete={vi.fn()}
            onArchive={vi.fn()}
            sortKey="date_desc"
            onSortKeyChange={vi.fn()}
            selectedIds={new Set<string>()}
            onSelectionChange={vi.fn()}
            onToggleAll={vi.fn()}
          />
        </SessionContext.Provider>
      </QueryClientProvider>
    ),
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([catchAll]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  return render(<RouterProvider router={router} />)
}

describe('le contrôle « prochaine action », descendu sur la ligne', () => {
  beforeEach(() => {
    hygiene.mockReset()
  })

  it('marque la ligne désignée par le serveur, et elle seule', async () => {
    hygiene.mockResolvedValue(answer({ withoutNextAction: { ids: ['acc-1'], truncated: false } }))

    renderTable([makeRow({ id: 'acc-1', company_name: 'edf' }), makeRow({ id: 'acc-2', company_name: 'sncf' })])

    const flagged = (await screen.findByText('Edf')).closest('tr')
    const untouched = screen.getByText('Sncf').closest('tr')
    expect(flagged).not.toBeNull()
    expect(untouched).not.toBeNull()
    expect(await within(flagged!).findByText('Sans prochaine action')).toBeInTheDocument()
    expect(within(untouched!).queryByText('Sans prochaine action')).toBeNull()
  })

  it('ne marque rien quand le serveur dit « je n’ai pas pu lire » — un vert optimiste serait pire', async () => {
    hygiene.mockResolvedValue(answer({ withoutNextAction: null }))

    renderTable([makeRow({ id: 'acc-1' })])

    await screen.findByText('Edf')
    expect(screen.queryByText('Sans prochaine action')).toBeNull()
  })

  it('ne marque rien quand la lecture a ÉCHOUÉ — l’absence de marque n’affirme rien', async () => {
    hygiene.mockRejectedValue(new Error('offre sans cockpit'))

    renderTable([makeRow({ id: 'acc-1' })])

    await screen.findByText('Edf')
    expect(screen.queryByText('Sans prochaine action')).toBeNull()
  })
})
