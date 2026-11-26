import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SessionContext } from '@/features/auth/session-context'

/**
 * PR 12C (#4496, maquette V22 comptes-liste) — UNE SEULE RANGÉE de menus au-dessus du tableau : les quatre
 * onglets du portefeuille, et à droite la bascule « Commercial | Facturation » en libellés courts. La seconde
 * rangée (vues nommées, #1580/#2150.8/#2150.9) est SUPPRIMÉE, « Mes listes de cibles » quitte la page (lot NAV),
 * et un ancien lien `?view=<vue>` ouvre « Tout le portefeuille », jamais une page vide.
 */

let search: Record<string, unknown> = {}
const contentProps: Record<string, unknown>[] = []
const accountsQueries: Record<string, unknown>[] = []

vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children, pageTitle }: { children: ReactNode; pageTitle?: string }) => (
    <div>
      <h1>{pageTitle}</h1>
      {children}
    </div>
  ),
}))
vi.mock('@tanstack/react-router', () => ({
  useSearch: () => search,
  useNavigate: () => () => undefined,
  Link: ({ children, to }: { children: ReactNode; to?: string }) => <a href={to}>{children}</a>,
}))
vi.mock('@/features/accounts/hooks/useAccounts', () => ({
  useAccounts: (query: Record<string, unknown>) => (
    accountsQueries.push(query),
    {
      data: {
        pages: [
          {
            counters: { total: 14, followed: 10, withoutNextAction: 3, activeRelations: 4, favorites: 3 },
            pagination: { totalItems: 14 },
            data: [],
          },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    }
  ),
}))
vi.mock('@/features/accounts/hooks/useAccountsInfiniteScroll', () => ({
  useAccountsCache: () => [
    {
      id: 'sg',
      company_name: 'Société Générale',
      sector: 'Banque',
      priority_score: 9,
      status: 'completed',
      created_at: '2026-10-01',
      next_action_label: 'Relancer Maxime Delaunay',
      commercial_status: 'customer',
    },
  ],
  useInfiniteScrollRef: () => () => undefined,
}))
vi.mock('./AccountContent', () => ({
  AccountContent: (props: Record<string, unknown>) => {
    contentProps.push(props)
    return <div data-testid="account-content" />
  },
}))
vi.mock('@/features/sprints/view/SprintBoard', () => ({ SprintBoard: () => null }))
vi.mock('@/features/accounts/hooks/useSetAccountFavorite', () => ({
  useSetAccountFavorite: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/components/primitives/AskLaura', () => ({ AskLaura: () => <span data-testid="ask-laura" /> }))
vi.mock('@/features/universal-import/view/ImportPortfolioButton', () => ({ ImportPortfolioButton: () => null }))

const { AccountsPage } = await import('./AccountsPage')
const { accountsSearchSchema } = await import('@/features/accounts/model/accountsSearch')

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <SessionContext.Provider value={{ user: null, loading: false }}>
        <AccountsPage />
      </SessionContext.Provider>
    </QueryClientProvider>,
  )
}

/** `a` précède `b` dans le document. */
function before(a: Element, b: Element): boolean {
  return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
}

const OLD_VIEW_KEYS = [
  'all',
  'priorities',
  'withoutNextAction',
  'recentSignal',
  'accessPath',
  'activeCustomers',
  'toRefresh',
] as const
const OLD_VIEW_LABELS = [
  'Mes priorités',
  'Sans prochaine action',
  'Avec signal récent',
  'Avec voie d’accès',
  'Clients actifs',
  'À actualiser',
]

describe('/accounts — une seule rangée de menus (#4496)', () => {
  it('quatre onglets du portefeuille, puis la bascule Commercial | Facturation, et rien d’autre', () => {
    search = {}
    renderPage()
    const tabs = ['Tout le portefeuille', 'Favoris', 'Suivis', 'Archives'].map(name =>
      screen.getByRole('button', { name }),
    )
    expect(screen.getAllByRole('button', { name: 'Tout le portefeuille' })).toHaveLength(1)
    const commercial = screen.getByRole('button', { name: 'Commercial' })
    const billing = screen.getByRole('button', { name: 'Facturation' })
    expect(commercial).toHaveAttribute('aria-pressed', 'true')
    expect(billing).toHaveAttribute('aria-pressed', 'false')
    expect(Boolean(tabs[3]!.compareDocumentPosition(commercial) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)
    expect(screen.queryByText(/Regarder ce portefeuille/)).toBeNull()
    expect(screen.queryByText(/Sous l’angle/)).toBeNull()
  })

  it('la seconde rangée (vues nommées) est supprimée, pas déplacée', () => {
    search = {}
    renderPage()
    for (const label of OLD_VIEW_LABELS) expect(screen.queryByText(label)).toBeNull()
    expect(screen.queryByRole('navigation', { name: /vues/i })).toBeNull()
  })

  it('« Mes listes de cibles » quitte la page (le lot NAV le pose dans le sous-menu Comptes)', () => {
    search = {}
    renderPage()
    expect(screen.queryByText('Mes listes de cibles')).toBeNull()
  })

  it.each(OLD_VIEW_KEYS)('un ancien lien `?view=%s` ouvre « Tout le portefeuille »', key => {
    search = accountsSearchSchema.parse({ view: key })
    expect(search).not.toHaveProperty('view')
    contentProps.length = 0
    renderPage()
    expect(screen.getByRole('button', { name: 'Tout le portefeuille' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('account-content')).toBeInTheDocument()
  })
})

describe('/accounts — « Filtrer mon portefeuille » filtre réellement (#4498)', () => {
  it('chaque critère serveur de l’URL part dans la requête de la liste (avant : rien ; après : le critère)', () => {
    search = {}
    accountsQueries.length = 0
    renderPage()
    const before = accountsQueries.at(-1)!
    for (const key of ['sector', 'tag', 'gate', 'entityKind', 'freshness', 'score']) expect(before[key]).toBeUndefined()
    expect(before.lifecycle).toBe('all')
    expect(before.status).toBe('all')

    search = {
      sector: 'Banque',
      tag: 'Cloud',
      gate: 'prioritised',
      entityKind: 'subsidiary',
      freshness: 'stale',
      score: 'high',
      lifecycle: 'opening',
      status: 'completed',
    }
    accountsQueries.length = 0
    renderPage()
    expect(accountsQueries.at(-1)).toMatchObject(search)
  })

  it('la page passe à la modale les critères lus dans l’URL, et sait les réécrire', () => {
    search = { sector: 'Banque', lifecycle: 'dormant' }
    contentProps.length = 0
    renderPage()
    expect(contentProps.at(-1)?.portfolioFilters).toMatchObject({
      sector: ['Banque'],
      secondary: ['dormant'],
      relation: [],
    })
    expect(typeof contentProps.at(-1)?.onApplyPortfolioFilters).toBe('function')
  })
})
