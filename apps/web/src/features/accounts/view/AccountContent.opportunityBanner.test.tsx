import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from '@/lib/api'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import type { ListNarrowing } from '@/features/accounts/lib/listNarrowing'
import { AccountContent } from './AccountContent'
import type { AccountRow } from './accounts-list/types'

/**
 * Recette démo 05/10/2026 — « 0 opportunité à fort potentiel » : quatorze comptes analysés, tous au palier
 * PRUDENT (aucun n'atteint la coupure « opportunité »). L'encart « Concentre-toi sur tes meilleures
 * opportunités… Voir les opportunités → » promettait un geste qui mène à une liste vide — le défaut même
 * de la recette du 30/08. On n'affiche pas ce qu'on n'a pas : sans opportunité, pas d'encart.
 */
const apiFetchMock = vi.mocked(apiFetch)

vi.mock('framer-motion', () => {
  const motionTags = new Map<string, any>()
  return {
    motion: new Proxy(
      {},
      {
        get: (_target: unknown, prop: string) => {
          if (typeof prop !== 'string') return undefined
          if (!motionTags.has(prop)) {
            const Component = prop
            motionTags.set(prop, ({ children, ...props }: any) => <Component {...props}>{children}</Component>)
          }
          return motionTags.get(prop)
        },
      },
    ),
    AnimatePresence: ({ children }: any) => <>{children}</>,
    useInView: () => true,
    useReducedMotion: () => false,
    useScroll: () => ({ scrollYProgress: { get: () => 0 } }),
    useTransform: () => 0,
  }
})

function makeAccount(overrides: Partial<AccountRow> = {}): AccountRow {
  return {
    id: 'acc-1',
    company_name: 'Doctolib',
    sector: 'Santé',
    priority_score: 5,
    status: 'completed',
    created_at: '2026-07-01T10:00:00.000Z',
    ...overrides,
  }
}

function renderAccounts(accounts: AccountRow[]) {
  renderWithRouter(
    <AccountContent
      accounts={accounts}
      counters={undefined}
      loading={false}
      failed={false}
      onRetry={() => {}}
      viewMode="list"
      onChangeViewMode={() => {}}
      selectedIds={new Set<string>()}
      onSelectedIdsChange={() => {}}
      compareOpen={false}
      onCompareOpenChange={() => {}}
      query=""
      onQueryChange={() => {}}
      sortKey="date_desc"
      onSortKeyChange={vi.fn()}
      activeTab="all"
      onTabChange={() => {}}
      activeFilters={[]}
      onFiltersChange={() => {}}
      onClearFilters={vi.fn()}
      narrowing={{ active: false, lifecycle: null } as ListNarrowing}
    />,
  )
}

describe('AccountContent — l’encart « meilleures opportunités »', () => {
  beforeEach(() => {
    apiFetchMock.mockReset()
    apiFetchMock.mockImplementation(({ path }: { path: string }) =>
      path === '/accounts/access-summary' ? Promise.resolve([]) : Promise.reject(new Error(`unmocked: ${path}`)),
    )
  })

  it('ne propose PAS « Voir les opportunités » quand aucun compte n’atteint la coupure', async () => {
    renderAccounts([
      makeAccount({ id: 'a', company_name: 'Doctolib', priority_score: 5 }),
      makeAccount({ id: 'b', company_name: 'Klesia', priority_score: 6 }),
    ])

    await screen.findByText('Doctolib')
    expect(screen.queryByText(/voir les opportunités/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/0 opportunité/i)).not.toBeInTheDocument()
  })

  it('le propose dès qu’un compte atteint la coupure (témoin : la garde sait dire OUI)', async () => {
    renderAccounts([
      makeAccount({ id: 'a', company_name: 'Doctolib', priority_score: 8 }),
      makeAccount({ id: 'b', company_name: 'Klesia', priority_score: 5 }),
    ])

    await screen.findByText('Doctolib')
    expect(screen.getByText(/voir les opportunités/i)).toBeInTheDocument()
    expect(screen.getByText(/1 opportunité à fort potentiel/i)).toBeInTheDocument()
  })
})
