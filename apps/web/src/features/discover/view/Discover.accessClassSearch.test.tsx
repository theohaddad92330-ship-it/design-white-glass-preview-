import { cleanup, fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import type { DiscoverCandidate, DiscoverResponse } from '@/features/discover/lib/discover-types'
import type { SavedSearch } from '@/features/discover/lib/discover-saved-searches'
import { emptyUnifiedFilters } from '@/features/discover/lib/discover-filters'
import { chooseOption, selectedValue } from '@/test/select'

/**
 * Manque B du 30/08 — le filtre de CLASSE ne survivait ni au rechargement ni
 * à un lien partagé : `apps/web/src/routes/discover/index.tsx` n'avait pas de
 * `validateSearch`, et la classe vivait dans un `useState` éphémère.
 *
 * Patron des tests : celui de `MissionsSourceFilter.test.tsx` /
 * `ProjectsPage.stageFilter.test.tsx` — le module de route est mocké (l'importer
 * pour de vrai ferait une boucle, la route important l'écran en retour), et
 * `useNavigate` est intercepté pour lire EXACTEMENT ce que l'écran écrirait
 * dans l'URL.
 */

const navigate = vi.fn()
let routerSearch: Record<string, unknown> = {}
const searchResult = vi.fn()
const savedSearches = vi.fn()

vi.mock('@/features/discover/hooks/useDiscoverSearch', () => ({
  useDiscoverSearch: () => searchResult(),
}))
vi.mock('@/features/discover/hooks/useDiscoverShortlist', () => ({
  useDiscoverShortlist: () => ({
    followed: new Set<string>(),
    dismissed: new Set<string>(),
    toggleFollow: vi.fn(),
    dismiss: vi.fn(),
    restoreAllDismissed: vi.fn(),
  }),
}))
vi.mock('@/features/discover/hooks/useSavedSearches', () => ({
  useSavedSearches: () => savedSearches(),
  useSavedSearchesStatus: () => ({ status: 'ready', searches: [] }),
}))
vi.mock('@/features/profile-context/hooks/useProfileContext', () => ({
  useProfileContext: () => ({ data: undefined }),
}))
vi.mock('@/features/plan-features/useFeatureLock', () => ({
  useFeatureLock: () => ({ locked: false, guard: (fn: () => void) => fn, dialog: null }),
}))
// Le module de route est mocké — l'importer pour de vrai ferait une boucle
// (la route importe l'écran). Même patron que MissionsPage/ProjectsPage.
vi.mock('@/routes/discover/index', () => ({ Route: { useSearch: () => routerSearch } }))
vi.mock('@tanstack/react-router', async importOriginal => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return { ...actual, useNavigate: () => navigate }
})
/**
 * ⚠️ Le Proxy MÉMORISE ses composants.
 *
 * Sans ce cache, chaque accès à `motion.div` rend une closure NEUVE : React voit
 * un type différent d'un rendu à l'autre, démonte tout le sous-arbre et le
 * remonte — l'état local des enfants part avec, et le test devient aveugle à
 * toute interaction qui change un état. Mesuré le 03/09 : un clic passait, le
 * `setState` était bien appelé, et l'écran entier disparaissait du DOM.
 */
const motionComponents = new Map<string, unknown>()

vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: (_target: unknown, prop: string) => {
        if (typeof prop === 'string') {
          const cached = motionComponents.get(prop)
          if (cached) return cached
          const Rendered = ({ children, ...props }: any) => {
            const Component = prop
            return <Component {...props}>{children}</Component>
          }
          motionComponents.set(prop, Rendered)
          return Rendered
        }
      },
    },
  ),
  AnimatePresence: ({ children }: any) => <>{children}</>,
  useInView: () => true,
  useScroll: () => ({ scrollYProgress: { get: () => 0 } }),
  useTransform: () => 0,
}))

const { Discover } = await import('./Discover')

function candidate(over: Partial<DiscoverCandidate> = {}): DiscoverCandidate {
  return {
    name: 'ACME',
    siren: '552100554',
    nafCode: null,
    sector: null,
    city: null,
    department: null,
    headcountRange: null,
    creationDate: null,
    score: 50,
    scoreMax: 100,
    scoreUnmeasured: [],
    dataConfidence: null,
    scoreFactors: [],
    signals: [],
    angle: null,
    suggestedRoles: [],
    portfolioState: 'new',
    accountId: null,
    sources: [],
    ...over,
  }
}

function response(): DiscoverResponse {
  return { candidates: [candidate()], query: {}, degraded: [], coverage: null }
}

/** Ouvre l'écran de résultats via le preset « Comptes qui recrutent » — le
 *  seul moyen, sans criteria saisi, de poser une requête non nulle (§ mode
 *  signaux). Le contenu réel de la recherche n'est pas ce qui est testé ici.
 *  #2504 (17/09/2026) — les pistes rapides vivent dans une modale : le geste
 *  ouvre d'abord le bouton « Pistes rapides », puis choisit la piste dedans. */
async function openResults() {
  renderWithRouter(<Discover />)
  fireEvent.click(await screen.findByRole('button', { name: /pistes rapides/i }))
  fireEvent.click(await screen.findByRole('button', { name: /comptes qui recrutent/i }))
  // #4490 (26/10) — une piste POSE désormais les critères et s'arrête là : aucun appel
  // sans geste. C'est « Explorer » qui lance la recherche, donc le test le clique aussi.
  fireEvent.click(await screen.findByRole('button', { name: 'Explorer' }))
  return openAccessClassFilter()
}

/** Refonte Théo (23/10) — la classe d'accès vit sous « Plus de filtres » de la barre des résultats
 *  (même filtre, même contrat d'URL) : on déplie le panneau avant de la lire. */
async function openAccessClassFilter() {
  fireEvent.click(await screen.findByRole('button', { name: /^Filtres/ }))
  return screen.findByRole('combobox', { name: /classe d'accès/i })
}

beforeEach(() => {
  cleanup()
  navigate.mockReset()
  routerSearch = {}
  searchResult.mockReturnValue({ data: response(), isFetching: false, isError: false, refetch: vi.fn() })
  savedSearches.mockReturnValue({ searches: [], save: vi.fn(), remove: vi.fn(), markRun: vi.fn() })
})

describe('Découvrir — le filtre de classe survit au rechargement (§B)', () => {
  it('lit la classe d’accès depuis l’URL au premier rendu', async () => {
    routerSearch = { class: 'B' }
    const select = await openResults()
    expect(await selectedValue(select)).toBe('B')
  })

  it('sans paramètre, le filtre reste « toutes » — comportement inchangé', async () => {
    const select = await openResults()
    expect(await selectedValue(select)).toBe('any')
  })

  it('une valeur hors vocabulaire retombe sur « toutes » plutôt que de planter l’écran', async () => {
    // Le lien collé de travers : `.catch(undefined)` du schéma de route.
    routerSearch = { class: 'Z' }
    const select = await openResults()
    expect(await selectedValue(select)).toBe('any')
  })

  it('changer la classe écrit `class` dans l’URL SANS perdre les autres paramètres', async () => {
    routerSearch = { sectors: 'it', class: 'A' }
    const select = await openResults()
    await chooseOption(select, 'C')

    expect(navigate).toHaveBeenCalled()
    const call = navigate.mock.calls.at(-1)?.[0] as {
      search: (prev: Record<string, unknown>) => Record<string, unknown>
    }
    // Le piège : un `search` littéral aurait écrasé `sectors`. La fonction
    // reçoit le VRAI `prev` porté par le routeur et doit le reconduire.
    expect(call.search({ sectors: 'it', class: 'A' })).toEqual({ sectors: 'it', class: 'C' })
  })

  it('revenir à « toutes » EFFACE le paramètre plutôt que d’écrire la valeur « any »', async () => {
    routerSearch = { class: 'A' }
    const select = await openResults()
    await chooseOption(select, 'any')

    const call = navigate.mock.calls.at(-1)?.[0] as {
      search: (prev: Record<string, unknown>) => Record<string, unknown>
    }
    expect(call.search({ class: 'A' })).toEqual({ class: undefined })
  })

  it('appliquer une recherche enregistrée existante ne casse pas l’écran et laisse la classe de l’URL intacte', async () => {
    // Forme D'AVANT ce chantier : aucune recherche enregistrée n'a jamais porté
    // de classe (elle n'existait pas). La charger ne doit ni planter, ni écrire
    // une classe — elle reste un réglage de l'ÉCRAN, indépendant du rail.
    //
    // #2165.64 — DEPUIS ce chantier, appliquer une recherche enregistrée EST
    // lancer une recherche (`applySavedSearch` → `launch`), et `launch` écrit
    // désormais ses filtres dans l'URL pour survivre à un rechargement :
    // `navigate` EST donc appelé. Ce que ce test protège n'a pas changé — la
    // classe, elle, n'en fait pas partie et doit traverser cet appel intacte.
    const saved: SavedSearch = {
      id: 's1',
      label: 'ETI industrielles 69',
      filters: { ...emptyUnifiedFilters(), department: '69' },
      savedAt: 1,
      objective: null,
      alertFrequency: 'manual',
      alertChannel: null,
      // #2151.5 / .8 / .9 — non qualifie, et « non mesure » n'est pas 0.
      resultType: null,
      newItems: null,
      sourceKinds: [],
      lastRunAt: null,
      ownerId: null,
      ownerName: null,
      shared: false,
    }
    // « Reprendre » rejoue la recherche ET ramène à Découvrir : l'URL perd `view`, la classe reste.
    const markRun = vi.fn(() => {
      routerSearch = { class: 'D' }
    })
    savedSearches.mockReturnValue({ searches: [saved], save: vi.fn(), remove: vi.fn(), markRun })
    // Théo decouvrir-historique — les recherches enregistrées se rejouent depuis « Mes recherches » (?view=history).
    routerSearch = { class: 'D', view: 'history' }

    renderWithRouter(<Discover />)
    fireEvent.click(await screen.findByRole('button', { name: 'Reprendre' }))

    // #3873 — « Rejouer » EST une exécution : sans ce geste, la carte restait
    // « Jamais rejouée » indéfiniment, même juste après le clic (recette prod
    // 09/10).
    expect(markRun).toHaveBeenCalledWith(saved.id)

    const select = await openAccessClassFilter()
    expect(await selectedValue(select)).toBe('D')
    // #2165.64 — `launch` écrit désormais les filtres de la recherche
    // enregistrée (`department: '69'`) dans l'URL, mais reconduit `class`
    // depuis `prev` sans y toucher : la classe reste 'D', jamais réécrite ni
    // effacée par ce chemin.
    expect(navigate).toHaveBeenCalled()
    const call = navigate.mock.calls.at(-1)?.[0] as {
      search: (prev: Record<string, unknown>) => Record<string, unknown>
    }
    const next = call.search({ class: 'D' })
    expect(next.class).toBe('D')
    expect(next.department).toBe('69')
  })
})
