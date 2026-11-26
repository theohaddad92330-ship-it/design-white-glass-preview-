import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import type { ListNarrowing } from '@/features/accounts/lib/listNarrowing'
import { AccountContent } from './AccountContent'

// Même cache par balise que `AccountContent.test.tsx` (voir l'explication là-bas).
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

// La lecture des archivés exige une session (`enabled: !!user`) : le harnais n'en a pas, ce fichier en pose une.
vi.mock('@/lib/hooks/use-session', () => {
  const session = { user: { id: 'u1' }, loading: false }
  return { useSession: () => session }
})

function renderAccounts(over: Partial<Parameters<typeof AccountContent>[0]> = {}) {
  const props = {
    accounts: [],
    counters: undefined,
    loading: false,
    failed: false,
    onRetry: () => {},
    viewMode: 'list' as const,
    onChangeViewMode: () => {},
    selectedIds: new Set<string>(),
    onSelectedIdsChange: () => {},
    compareOpen: false,
    onCompareOpenChange: () => {},
    query: '',
    onQueryChange: () => {},
    sortKey: 'date_desc' as const,
    onSortKeyChange: vi.fn(),
    activeTab: 'all',
    onTabChange: vi.fn(),
    activeFilters: [],
    onFiltersChange: () => {},
    onClearFilters: vi.fn(),
    narrowing: { active: false, lifecycle: null } as ListNarrowing,
    ...over,
  }
  renderWithRouter(<AccountContent {...props} />)
  return props
}

/**
 * #4621 — l'APPELANT : l'état vide d'une recherche par nom passe par `NotInPortfolioEmptyState`, et son geste ouvre
 * l'onglet « archived » (statut d'analyse `archived`, câblé par `AccountsPage`).
 */
describe('AccountContent — #4621 un compte archivé se dit archivé', () => {
  it('une recherche par nom qui ne rend rien lit les archivés et offre l’onglet « Hors priorité »', async () => {
    const { accountsApi } = await import('@/features/accounts/api')
    // La session posée ouvre les autres lectures de l'écran : sans réponse, `sectors.map` plante.
    vi.spyOn(accountsApi, 'listSectors').mockResolvedValue([])
    vi.spyOn(accountsApi, 'listTags').mockResolvedValue([])
    const list = vi.spyOn(accountsApi, 'list').mockResolvedValue({
      data: [],
      pagination: { currentPage: 1, size: 1, totalItems: 1, totalPages: 1, hasNext: false, hasPrev: false },
    })
    const props = renderAccounts({ query: 'ENGIE', narrowing: { active: true, lifecycle: null } })

    const button = await screen.findByRole('button', { name: /voir « hors priorité »/i })
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ q: 'ENGIE', status: 'archived' }))
    await userEvent.click(button)
    expect(props.onTabChange).toHaveBeenCalledWith('archived')
    vi.restoreAllMocks()
  })
})
