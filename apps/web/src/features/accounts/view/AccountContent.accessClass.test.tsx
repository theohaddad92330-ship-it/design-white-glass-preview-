import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from '@/lib/api'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import type { ListNarrowing } from '@/features/accounts/lib/listNarrowing'
import { AccountContent } from './AccountContent'
import type { AccountRow } from './accounts-list/types'

beforeAll(() => {
  // Radix Select (modale « Filtrer mon portefeuille ») : jsdom n'a ni capture de pointeur ni défilement.
  window.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false)
  window.HTMLElement.prototype.releasePointerCapture = vi.fn()
  window.HTMLElement.prototype.scrollIntoView = vi.fn()
})

/**
 * MANQUE B DU 30/08 — l'accessibilité (A-D) rejoint le portefeuille, filtre
 * compris. `raw_analysis.access_barrier` existe déjà par compte (onglet
 * Accès, depuis le 29/08) ; `GET /accounts/access-summary`
 * (`AccountAccessController`) le sert par compte pour tout le workspace, et
 * `AccountContent` le fusionne avec les lignes déjà chargées.
 */
const apiFetchMock = vi.mocked(apiFetch)

// Le cache par balise n'est pas décoratif : sans lui, `motion.div` rend une
// closure NEUVE à chaque rendu, ce que React lit comme un changement de
// TYPE de composant — et démonte/remonte tout le sous-arbre au premier
// re-rendu venu après le montage (voir l'investigation CI du 30/08 dans
// `AccountContent.selection.test.tsx`, qui a trouvé ce défaut — exactement
// le genre de re-rendu que `useAccessSummary` de ce fichier introduit).
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
    priority_score: 8,
    status: 'completed',
    created_at: '2026-07-01T10:00:00.000Z',
    ...overrides,
  }
}

function renderAccounts(over: Partial<Parameters<typeof AccountContent>[0]> = {}) {
  const props = {
    accounts: [
      makeAccount({ id: 'acc-1', company_name: 'Doctolib' }),
      makeAccount({ id: 'acc-2', company_name: 'Klesia' }),
    ],
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
  renderWithRouter(<AccountContent {...props} />)
  return props
}

describe('AccountContent — l’accessibilité du portefeuille (manque B)', () => {
  beforeEach(() => {
    apiFetchMock.mockReset()
    apiFetchMock.mockImplementation(({ path }: { path: string }) => {
      if (path === '/accounts/access-summary') {
        return Promise.resolve([
          { accountId: 'acc-1', accessClass: 'A' },
          { accountId: 'acc-2', accessClass: 'D' },
        ])
      }
      return Promise.reject(new Error(`unmocked path in test: ${path}`))
    })
  })

  it('affiche la classe fusionnée sur chaque ligne du tableau', async () => {
    renderAccounts()

    expect(await screen.findByText('Ouvert')).toBeInTheDocument()
    expect(await screen.findByText('Verrouillé')).toBeInTheDocument()
  })

  it('un filtre d’accessibilité ISOLÉ nomme l’état vide et ne montre que les comptes de la classe', async () => {
    renderAccounts()

    // Attend la fusion avant d'interagir, pour ne pas cliquer un filtre dont
    // les options dépendent d'un import déjà résolu (ACCESS_CLASSES).
    await screen.findByText('Ouvert')

    // #4498 (V22) — « Filtres » ouvre la modale « Filtrer mon portefeuille » ; l'accessibilité y garde sa
    // place (hors maquette, aucun filtre ne se perd) et ne s'applique qu'à « Appliquer les filtres ».
    await userEvent.click(screen.getByRole('button', { name: /^filtres$|^filters$/i }))
    await userEvent.click(
      within(await screen.findByRole('group', { name: 'Accessibilité' })).getByRole('button', {
        name: 'Verrouillage probable',
      }),
    )
    expect(screen.getByText('Doctolib')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Appliquer les filtres' }))

    await waitFor(() => {
      expect(screen.queryByText('Doctolib')).not.toBeInTheDocument()
    })
    expect(screen.getByText('Klesia')).toBeInTheDocument()
  })

  it('#4498 — « Type de compte » filtre réellement les lignes : avant, les deux ; après, l’intermédiaire seul', async () => {
    renderAccounts({
      accounts: [
        makeAccount({ id: 'acc-1', company_name: 'Doctolib' }),
        makeAccount({ id: 'acc-3', company_name: 'Hays', is_intermediary: true }),
      ],
    })
    await screen.findByText('Ouvert')
    expect(screen.getByText('Doctolib')).toBeInTheDocument()
    expect(screen.getByText('Hays')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /^filtres$|^filters$/i }))
    await userEvent.click(
      within(await screen.findByRole('group', { name: 'Type de compte' })).getByRole('button', {
        name: 'Intermédiaire',
      }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Appliquer les filtres' }))

    await waitFor(() => expect(screen.queryByText('Doctolib')).not.toBeInTheDocument())
    expect(screen.getByText('Hays')).toBeInTheDocument()
    // Le critère posé se relit sur le bouton, et en pastille retirable.
    expect(screen.getByRole('button', { name: 'Filtrer mon portefeuille : 1 critère posé' })).toBeInTheDocument()
  })
})

/**
 * N21 DU 30/08 — une PANNE de lecture ne se lit plus comme un vide.
 *
 * En production, `GET /accounts/access-summary` a répondu 500 : la colonne
 * affichait alors « — » sur chaque compte, EXACTEMENT ce qu'elle affiche
 * quand aucun compte n'a de barrière calculée. Impossible de distinguer une
 * panne d'un vide depuis l'écran.
 *
 * Cause : `AccountContent.tsx` fusionnait avec `Array.isArray(summary)` —
 * sur n'importe quel échec, `data` vaut `undefined`, non-tableau, et CHAQUE
 * compte reçoit `accessClass: undefined` en silence. Le hook expose pourtant
 * déjà `isError` ; rien ne le lisait.
 */
describe('AccountContent — une panne de lecture de l’accessibilité (N21)', () => {
  beforeEach(() => {
    apiFetchMock.mockReset()
    apiFetchMock.mockImplementation(({ path }: { path: string }) => {
      if (path === '/accounts/access-summary') {
        return Promise.reject(new Error('boom'))
      }
      return Promise.reject(new Error(`unmocked path in test: ${path}`))
    })
  })

  it('chaque ligne DIT que la lecture a échoué — jamais « — », jamais une classe devinée', async () => {
    renderAccounts()

    // Les DEUX lignes accusent la LECTURE, jamais la donnée.
    expect(await screen.findAllByText('Non lue')).toHaveLength(2)
    expect(screen.queryByTitle('Accessibilité non estimée')).not.toBeInTheDocument()
    expect(screen.getAllByTitle('L’accessibilité n’a pas pu être lue.')).toHaveLength(2)
  })

  it('désactive le filtre d’accessibilité, EN LE DISANT — jamais une liste vide qui se lit « aucun compte de cette classe »', async () => {
    renderAccounts()
    await screen.findAllByText('Non lue')

    const addFilter = screen.getByRole('button', { name: /^filtres$|^filters$/i })
    await userEvent.click(addFilter)
    expect(screen.queryByRole('menuitem', { name: 'Accessibilité' })).not.toBeInTheDocument()
    await userEvent.keyboard('{Escape}')

    // La raison est ÉCRITE, pas seulement devinable depuis l'absence du menu.
    expect(screen.getByText(/c’est la lecture qui a échoué/)).toBeInTheDocument()
  })

  it('ne casse ni la sélection ni le rendu des autres comptes', async () => {
    const onSelectedIdsChange = vi.fn()
    renderAccounts({ onSelectedIdsChange })
    await screen.findAllByText('Non lue')

    expect(screen.getByText('Doctolib')).toBeInTheDocument()
    expect(screen.getByText('Klesia')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('checkbox', { name: 'Sélectionner Doctolib' }))
    expect(onSelectedIdsChange).toHaveBeenCalledWith(new Set(['acc-1']))
  })
})
