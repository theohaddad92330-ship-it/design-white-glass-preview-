import { screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import type { DiscoverRequest } from '@/features/discover/hooks/useDiscoverSearch'

/**
 * #2493 — UN SEUL point de départ, pas deux blocs qui disent la même chose.
 *
 * Constat de Louis (/discover) : « "Laisser Bellum trouver" et "Ta cible"
 * sont similaires, n'en faire qu'un composant … en lui laissant toujours la
 * main avant de rechercher ». Avant ce lot :
 *  - la colonne de gauche (`DiscoverSidebar`) portait « Ta cible » ;
 *  - le contenu, à l'arrivée SEULEMENT (`request === null`), portait une
 *    carte plein cadre « Laisse Bellum trouver tes meilleures opportunités »
 *    dont le CTA lançait `launch(plan.filters)` IMMÉDIATEMENT — sans repasser
 *    par le rail, donc sans que l'utilisateur puisse ajuster avant le départ.
 *
 * Les deux avaient le même bouton « Laisse {{brand}} proposer tes prochaines
 * cibles » (`topbar.autopilot` ET `autopilot.cta` portent le même libellé) :
 * DEUX exemplaires du même bouton à l'écran. Après le lot, il n'y en avait
 * plus qu'UN (le raccourci du haut, à côté de la saisie libre — #2481) ;
 * le point de départ unique, dans la colonne de gauche, pré-remplit le rail
 * et l'ouvre au clic (#2488, même patron), il ne lance rien tout seul.
 *
 * #3081 (beta, 26/09/2026) — le raccourci restant (`topbar.autopilot`,
 * lancement immédiat) est retiré à son tour, à la demande de Louis
 * (« supprimer ») : il n'y en a donc plus ZÉRO exemplaire, et le SEUL geste
 * qui pose un critère de départ reste « Appliquer à la recherche »
 * (`DiscoverSidebar`), qui ne lance toujours rien seul.
 *
 * Patron de mocks copié sur `Discover.commandes.test.tsx`.
 */

vi.mock('@/routes/discover/index', () => ({ Route: { useSearch: () => ({}) } }))

const useDiscoverSearchSpy = vi.fn((_request: DiscoverRequest | null) => ({
  data: undefined,
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
// Aucun profil ESN — le point de départ retombe sur le marché (`noProfile`),
// exactement le cas que la carte « Laisse Bellum trouver » ciblait seule.
vi.mock('@/features/profile-context/hooks/useProfileContext', () => ({
  useProfileContext: () => ({ data: undefined }),
}))
vi.mock('@/features/plan-features/useFeatureLock', () => ({
  useFeatureLock: () => ({ locked: false, guard: (fn: () => void) => fn, dialog: null }),
}))

/** ⚠️ Le Proxy MÉMORISE ses composants — voir `Discover.test.tsx`. */
const motionComponents = new Map<string, unknown>()
vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: (_target: unknown, prop: string) => {
        if (typeof prop === 'string') {
          const cached = motionComponents.get(prop)
          if (cached) return cached
          const Rendered = ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => {
            const Component = prop as 'div'
            return <Component {...props}>{children}</Component>
          }
          motionComponents.set(prop, Rendered)
          return Rendered
        }
      },
    },
  ),
  AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
  useInView: () => true,
  useScroll: () => ({ scrollYProgress: { get: () => 0 } }),
  useTransform: () => 0,
}))

const { Discover } = await import('./Discover')

describe('#2493 — un seul point de départ', () => {
  it('aucun bouton « propose tes prochaines cibles » — retiré par #3081, seul reste « Appliquer à la recherche »', async () => {
    renderWithRouter(<Discover />)
    await screen.findByText(/notre méthode en 3 étapes/i)

    expect(screen.queryAllByRole('button', { name: /proposer tes prochaines cibles/i })).toHaveLength(0)
  })

  it('#4530.5 — le panneau « Ta cible » et son bouton « Appliquer à la recherche » ne sont plus sur Découvrir', async () => {
    renderWithRouter(<Discover />)
    await screen.findByRole('button', { name: /^explorer$/i })
    expect(screen.queryByRole('button', { name: /^appliquer à la recherche$/i })).toBeNull()
  })
})
