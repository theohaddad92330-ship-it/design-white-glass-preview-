import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import discoverFr from '@/i18n/locales/fr/discover.json'
import type { DiscoverRequest } from '@/features/discover/hooks/useDiscoverSearch'
import type { DiscoverRegistryQuery, DiscoverResponse } from '@/features/discover/lib/discover-types'

/**
 * #2165.60 — RÉFUTÉ en prod le 19/09 : « qui recrute des développeurs Java à
 * Toulouse », tapé en mode Besoins (`?type=needs`), rendait 40 résultats hors
 * sujet (plongeur, valet de chambre ; départements 26/16/05/38) et un rail
 * resté VIDE. Le texte libre part TOUJOURS comme une recherche REGISTRE
 * (`Discover.freetextSearch.test.tsx` le prouve pour le type Comptes) — ce
 * test prouve que, en Besoins, ce qui EST lisible (la ville) atteint bien la
 * requête RÉELLEMENT envoyée, au lieu de rester lettre morte dans la phrase.
 *
 * Patron de mocks copié sur `Discover.freetextSearch.test.tsx`.
 */

vi.mock('@/routes/discover/index', () => ({
  Route: { useSearch: () => ({ type: 'needs' }) },
}))

const useDiscoverSearchSpy = vi.fn((_request: DiscoverRequest | null) => ({
  data: undefined as DiscoverResponse | undefined,
  isFetching: false,
  isError: false,
  refetch: vi.fn(),
}))
vi.mock('@/features/discover/hooks/useDiscoverSearch', () => ({
  useDiscoverSearch: (request: DiscoverRequest | null) => useDiscoverSearchSpy(request),
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
  useSavedSearches: () => ({ searches: [], save: vi.fn(), remove: vi.fn(), markRun: vi.fn() }),
  useSavedSearchesStatus: () => ({ status: 'ready', searches: [] }),
}))
vi.mock('@/features/profile-context/hooks/useProfileContext', () => ({
  useProfileContext: () => ({ data: undefined }),
}))
vi.mock('@/features/plan-features/useFeatureLock', () => ({
  useFeatureLock: () => ({ locked: false, guard: (fn: () => void) => fn, dialog: null }),
}))

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

/** Le rail ouvre déplié à l'arrivée sans recherche ; replié après une recherche restaurée. */
async function ouvrirLeRail() {
  await screen.findByRole('button', { name: discoverFr.explore.submit })
}

describe('#2165.60 — en Besoins, un texte ancien pose ce qu’il peut sur le rail (#3646 : sans saisie)', () => {
  /** #3646 — plus de saisie libre : le texte ne vient que d'une recherche ancienne (URL). */
  const lancerAvecLesCriteres = async (texte: string) => {
    renderWithRouter(<Discover />, `/discover?type=needs&freetext=${encodeURIComponent(texte)}`)
    await ouvrirLeRail()
    fireEvent.click(await screen.findByRole('button', { name: discoverFr.explore.submit }))
  }

  it('« à <Ville> » d’un texte conservé atteint la ZONE de la requête réellement envoyée', async () => {
    await lancerAvecLesCriteres('qui recrute des développeurs Java à Toulouse')

    const lastCall = useDiscoverSearchSpy.mock.calls.at(-1)?.[0] as DiscoverRequest
    expect(lastCall?.mode).toBe('registry')
    const filters = (lastCall?.query as DiscoverRegistryQuery).filters
    // Le texte n'est jamais effacé (#3646) ; la ville reconnue filtre VRAIMENT.
    expect(filters.freetext).toBe('qui recrute des développeurs Java à Toulouse')
    expect(filters.city).toBe('Toulouse')
  })

  it('sans « à <Ville> » reconnaissable, la zone n’est jamais devinée', async () => {
    await lancerAvecLesCriteres('sociétés de conseil en cybersécurité')

    const lastCall = useDiscoverSearchSpy.mock.calls.at(-1)?.[0] as DiscoverRequest
    expect((lastCall?.query as DiscoverRegistryQuery).filters.city).toBeUndefined()
  })
})
