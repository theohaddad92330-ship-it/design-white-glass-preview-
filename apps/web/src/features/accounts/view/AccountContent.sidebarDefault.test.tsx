/**
 * #1795 — « quand on arrive sur la page, quand on la refresh et tout, par
 * défaut ça doit toujours être replié ».
 *
 * ─────────────────────────────────────────────────────────────────────────
 * L'ÉTAT MESURÉ AVANT CE CORRECTIF
 * ─────────────────────────────────────────────────────────────────────────
 * Le seul panneau à ouverture conditionnelle de `/accounts` est
 * `AccountsSidebar` (« Comptes proches de ta cible » + historique récent),
 * monté par `AccountContent.tsx`. Son état initial était
 * `useState(() => window.innerWidth >= ACCOUNTS_PANEL_MIN_WIDTH)` — ouvert
 * dès 1536 px, l'INVERSE de ce que Louis demande. Ces tests échouent sur le
 * composant d'avant correctif (le panneau est visible sur une fenêtre large)
 * et passent une fois l'ouverture initiale ancrée à `false`, quelle que soit
 * la largeur.
 */
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import type { ListNarrowing } from '@/features/accounts/lib/listNarrowing'
import type { AccountRow } from './accounts-list/types'
import { AccountContent } from './AccountContent'

// Le cache par balise n'est pas décoratif : sans lui, `motion.div` rend une
// closure NEUVE à chaque rendu, ce que React lit comme un changement de TYPE
// de composant — et démonte/remonte tout le sous-arbre au premier re-rendu
// venu après le montage (`AccountContent.selection.test.tsx`).
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

const ACCOUNTS: AccountRow[] = [
  {
    id: 'a1',
    company_name: 'Doctolib',
    sector: 'Santé',
    priority_score: 80,
    status: 'completed',
    created_at: '2026-07-18T10:00:00.000Z',
  },
]

function renderAccounts(over: Partial<Parameters<typeof AccountContent>[0]> = {}) {
  const props = {
    accounts: ACCOUNTS,
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
    onTabChange: () => {},
    activeFilters: [],
    onFiltersChange: () => {},
    onClearFilters: vi.fn(),
    narrowing: { active: false, lifecycle: null } as ListNarrowing,
    ...over,
  }
  return renderWithRouter(<AccountContent {...props} />)
}

/** Le panneau n'existe que sous ce libellé — sa présence prouve qu'il est monté. */
const SIDEBAR_TEXT = /Historique récent/i

describe('AccountContent — le panneau latéral est replié par défaut (#1795)', () => {
  const originalInnerWidth = window.innerWidth
  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: originalInnerWidth, configurable: true, writable: true })
  })

  it('reste replié même sur une fenêtre LARGE (>= 1536 px) — l’ancien défaut ouvrait ici', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 1920, configurable: true, writable: true })
    renderAccounts()

    // Le tableau est bien rendu (on n'est pas dans un état de chargement).
    await screen.findByText('Doctolib')
    expect(screen.queryByText(SIDEBAR_TEXT)).not.toBeInTheDocument()
  })

  it('reste replié sur une fenêtre étroite aussi — le même invariant, pas un cas par largeur', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 375, configurable: true, writable: true })
    renderAccounts()

    await screen.findByText('Doctolib')
    expect(screen.queryByText(SIDEBAR_TEXT)).not.toBeInTheDocument()
  })

  it('le bouton qui l’ouvre reste accessible et annonce l’état replié', async () => {
    renderAccounts()
    await screen.findByText('Doctolib')

    const toggle = screen.getByRole('button', { name: /panneau comptes/i })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
  })

  it('un clic ouvre le panneau, et le geste tient tant qu’on reste sur l’écran', async () => {
    const user = userEvent.setup()
    renderAccounts()
    await screen.findByText('Doctolib')

    const toggle = screen.getByRole('button', { name: /panneau comptes/i })
    await user.click(toggle)

    expect(await screen.findByText(SIDEBAR_TEXT)).toBeInTheDocument()
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
  })

  it('un rafraîchissement (un montage NEUF) ne restaure pas l’ouverture — pas de localStorage, pas d’URL', async () => {
    const user = userEvent.setup()
    const { unmount } = renderAccounts()
    await screen.findByText('Doctolib')

    const toggle = screen.getByRole('button', { name: /panneau comptes/i })
    await user.click(toggle)
    expect(await screen.findByText(SIDEBAR_TEXT)).toBeInTheDocument()

    unmount()
    renderAccounts()
    await screen.findByText('Doctolib')

    expect(screen.queryByText(SIDEBAR_TEXT)).not.toBeInTheDocument()
  })
})
