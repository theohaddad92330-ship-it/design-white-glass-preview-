import { fireEvent, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import type { DiscoverRequest } from '@/features/discover/hooks/useDiscoverSearch'

/**
 * #4529 (arrivée neutre) + #4530 (bouton « Ma cible »), contrat validé par Louis le 24/10.
 *
 * L'URL est un objet MUTABLE : `navigate` y applique le `search` demandé, comme le routeur, pour que le mode
 * de contexte lu dans l'URL change vraiment d'un clic à l'autre. Patron de mocks : `Discover.singleStartingPoint`.
 */

const routeSearch: Record<string, unknown> = {}
const navigateSpy = vi.fn((options: { search?: unknown }) => {
  if (typeof options.search !== 'function') return
  const next = (options.search as (prev: Record<string, unknown>) => Record<string, unknown>)({ ...routeSearch })
  for (const key of Object.keys(routeSearch)) delete routeSearch[key]
  for (const [key, value] of Object.entries(next)) if (value !== undefined) routeSearch[key] = value
})
vi.mock('@tanstack/react-router', async importOriginal => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => navigateSpy,
}))
vi.mock('@/routes/discover/index', () => ({ Route: { useSearch: () => routeSearch } }))

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
const icp = vi.hoisted(() => ({
  value: { size: 'eti', sectorsPriority: ['Banque'], decisionLevel: 'director', entryStrategy: 'topDown' } as Record<
    string,
    unknown
  >,
}))
vi.mock('@/features/profile-context/hooks/useProfileContext', () => ({
  useProfileContext: () => ({ data: { profile_context: { idealAccountProfile: icp.value } } }),
}))
vi.mock('@/features/profile/hooks/useEsnProfile', () => ({ useEsnProfile: () => ({ data: undefined }) }))
vi.mock('@/features/profile/hooks/useOfferPortfolio', () => ({
  useOfferPortfolio: () => ({ data: undefined, isPending: false }),
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

const myTargetButton = () => screen.getByRole('button', { name: /^ma cible$/i })
const lastRequest = () => useDiscoverSearchSpy.mock.calls.at(-1)?.[0] ?? null

beforeEach(() => {
  icp.value = { size: 'eti', sectorsPriority: ['Banque'], decisionLevel: 'director', entryStrategy: 'topDown' }
  for (const key of Object.keys(routeSearch)) delete routeSearch[key]
  useDiscoverSearchSpy.mockClear()
  navigateSpy.mockClear()
})

describe('#4529 — Découvrir arrive neutre, sans aucun filtre posé d’office', () => {
  it('#4529.1 — arrivée nue : aucune zone, aucun secteur, aucune pastille de filtre, aucune recherche', async () => {
    renderWithRouter(<Discover />)
    await screen.findByRole('button', { name: /^explorer$/i })
    expect(screen.getByTestId('discover-chip-sectors')).toHaveTextContent('Tous les secteurs')
    expect(screen.getByTestId('discover-chip-territory')).not.toHaveTextContent(/grand est|auvergne|île-de-france/i)
    for (const call of useDiscoverSearchSpy.mock.calls) expect(call[0]).toBeNull()
    expect(myTargetButton()).toHaveAttribute('aria-pressed', 'false')
  })

  it('#4529.2 — une URL qui porte ses critères les garde (un lien n’est pas une arrivée nue)', async () => {
    routeSearch.region = '84'
    renderWithRouter(<Discover />, '/?region=84')
    await screen.findByRole('button', { name: /^explorer$/i })
    await waitFor(() => expect(screen.getByTestId('discover-chip-territory')).not.toHaveTextContent('Toute la France'))
  })
})

describe('#4530 — « Ma cible » est un bouton bascule', () => {
  it('#4530.1 — un bouton, aria-pressed, tabulable ; ni panneau « Ta cible » ni sélecteur « Contexte »', async () => {
    const { container } = renderWithRouter(<Discover />)
    await screen.findByRole('button', { name: /^explorer$/i })
    const button = myTargetButton()
    expect(button.tagName).toBe('BUTTON')
    expect(button).not.toHaveAttribute('tabindex', '-1')
    expect(button.className).toMatch(/min-h-11/)
    expect(screen.queryByRole('button', { name: /^appliquer à la recherche$/i })).toBeNull()
    expect(container.querySelector('[data-surface-context]')).toBeNull()
    expect(screen.queryByText(/ce que bellum a compris/i)).toBeNull()
  })

  // #4490 — « Ma cible » POSE les critères (#4529.3 : zone + secteurs) et le contexte, et NE LANCE RIEN : seul
  // « Explorer » dépense. Le test sait dire NON : il échoue si un clic sur « Ma cible » déclenche une requête.
  it('#4490 / #4529.3 — activé : contexte « Mon activité » + critères du profil posés, AUCUNE requête avant « Explorer »', async () => {
    renderWithRouter(<Discover />)
    await screen.findByRole('button', { name: /^explorer$/i })
    useDiscoverSearchSpy.mockClear()

    fireEvent.click(myTargetButton())

    expect(myTargetButton()).toHaveAttribute('aria-pressed', 'true')
    expect(routeSearch.context).toBe('my_activity')
    expect(screen.getByTestId('discover-chip-sectors')).not.toHaveTextContent('Tous les secteurs')
    for (const call of useDiscoverSearchSpy.mock.calls) expect(call[0]).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /^explorer$/i }))
    expect(lastRequest()?.query.contextMode).toBe('my_activity')
  })

  it('#4530.3 / #4490 — re-clic : critères retirés, contexte Neutre, rien n’est relancé', async () => {
    renderWithRouter(<Discover />)
    await screen.findByRole('button', { name: /^explorer$/i })
    fireEvent.click(myTargetButton())
    fireEvent.click(myTargetButton())

    expect(myTargetButton()).toHaveAttribute('aria-pressed', 'false')
    expect(routeSearch.context).toBeUndefined()
    expect(screen.getByTestId('discover-chip-sectors')).toHaveTextContent('Tous les secteurs')
  })

  it('#4530.7 — ?context=my_activity ouvre le bouton activé', async () => {
    routeSearch.context = 'my_activity'
    renderWithRouter(<Discover />)
    await screen.findByRole('button', { name: /^explorer$/i })
    expect(myTargetButton()).toHaveAttribute('aria-pressed', 'true')
  })

  it('#4530.6 — ?context=one_off_mission est toujours lu : le bouton n’est pas activé', async () => {
    routeSearch.context = 'one_off_mission'
    renderWithRouter(<Discover />)
    await screen.findByRole('button', { name: /^explorer$/i })
    expect(myTargetButton()).toHaveAttribute('aria-pressed', 'false')
  })

  it('#4529.1 — sans `?context`, la recherche part EXPLICITEMENT en Neutre (pas le défaut de l’espace)', async () => {
    routeSearch.region = '84'
    renderWithRouter(<Discover />, '/?region=84')
    await waitFor(() => expect(screen.getByTestId('discover-chip-territory')).not.toHaveTextContent('Toute la France'))
    fireEvent.click(screen.getByRole('button', { name: /^explorer$/i }))
    expect(lastRequest()?.query.contextMode).toBe('neutral')
  })

  it('#4530.9 — plus de 5 secteurs au profil : AUCUNE modale, la bascule pose 5 secteurs et DIT la coupe', async () => {
    icp.value = {
      size: 'eti',
      sectorsPriority: ['Banque', 'Assurance', 'Industrie', 'Énergie', 'Santé', 'Transport', 'Retail'],
      decisionLevel: 'director',
      entryStrategy: 'topDown',
    }
    renderWithRouter(<Discover />)
    await screen.findByRole('button', { name: /^explorer$/i })
    fireEvent.click(myTargetButton())
    expect(screen.queryByRole('button', { name: 'Appliquer ces secteurs' })).toBeNull()
    expect(myTargetButton()).toHaveAttribute('aria-pressed', 'true')
    expect(routeSearch.context).toBe('my_activity')
    expect(screen.getByTestId('discover-chip-sectors')).not.toHaveTextContent('Tous les secteurs')
    expect(screen.getByTestId('discover-my-target-trim')).toHaveTextContent(/^5 secteurs sur \d+ posés/)
    fireEvent.click(myTargetButton())
    expect(screen.queryByTestId('discover-my-target-trim')).toBeNull()
    expect(screen.getByTestId('discover-chip-sectors')).toHaveTextContent('Tous les secteurs')
  })
})
