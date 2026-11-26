import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import discoverFr from '@/i18n/locales/fr/discover.json'

/**
 * #4574 (décision Louis 25/10/2026) — « Chercher une personne par nom » n'est plus une carte : le nom se tape dans
 * le champ libre du rail (« Marion Sagnard chez Bedrock »), un seul champ, un seul bouton. Ces tests lisent l'ÉCRAN
 * de la vue des personnes, pas le modèle. Revient sur #2727.
 */
let routeSearch: Record<string, unknown> = {}
const navigate = vi.fn((options: { search?: (prev: Record<string, unknown>) => Record<string, unknown> }) => {
  if (options.search) routeSearch = options.search(routeSearch)
})
const searchResult = vi.fn()

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
  useSavedSearches: () => ({ searches: [], save: vi.fn(), remove: vi.fn(), markRun: vi.fn() }),
  useSavedSearchesStatus: () => ({ status: 'ready', searches: [] }),
}))
vi.mock('@/features/profile-context/hooks/useProfileContext', () => ({
  useProfileContext: () => ({ data: undefined }),
}))
vi.mock('@/features/plan-features/useFeatureLock', () => ({
  useFeatureLock: () => ({ locked: false, guard: (fn: () => void) => fn, dialog: null }),
}))
vi.mock('@/features/profile/hooks/useEsnProfile', () => ({
  useEsnProfile: () => ({ data: {} }),
}))
vi.mock('@/features/discover/hooks/useDiscoverPeople', () => ({
  useDiscoverPeople: () => ({
    data: { data: [] },
    isFetching: false,
    isError: false,
    isSuccess: true,
    refetch: vi.fn(),
  }),
}))
const { searchByName } = vi.hoisted(() => ({ searchByName: vi.fn() }))
vi.mock('@/features/contacts/api', async importOriginal => {
  const actual = await importOriginal<typeof import('@/features/contacts/api')>()
  return { ...actual, contactsApi: { ...actual.contactsApi, searchByName } }
})
vi.mock('@/routes/discover/index', () => ({ Route: { useSearch: () => routeSearch } }))
vi.mock('@tanstack/react-router', async importOriginal => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return { ...actual, useNavigate: () => navigate }
})
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

const MARION = {
  id: 'apollo-1',
  firstName: 'Marion',
  lastNameObfuscated: 'Sa***d',
  title: 'DRH',
  organizationName: 'Bedrock',
  city: 'Paris',
  country: 'France',
  hasEmail: true,
  hasPhone: false,
}

beforeEach(() => {
  navigate.mockClear()
  searchByName.mockReset()
  routeSearch = { type: 'contacts' }
  searchResult.mockReturnValue({ data: undefined, isFetching: false, isError: false, refetch: vi.fn() })
})

const explore = async (text: string) => {
  fireEvent.change(await screen.findByRole('searchbox', { name: discoverFr.explore.label }), {
    target: { value: text },
  })
  fireEvent.click(screen.getByRole('button', { name: discoverFr.explore.submit }))
}

describe('#4574 — la saisie par nom vit dans le champ libre du rail', () => {
  it('aucune carte « Chercher une personne par nom », ni second champ, ni second bouton', async () => {
    renderWithRouter(<Discover />)
    await screen.findByRole('searchbox', { name: discoverFr.explore.label })
    expect(screen.queryByText('Chercher une personne par nom')).toBeNull()
    expect(screen.queryByLabelText(/nom et prénom/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /^chercher$/i })).toBeNull()
    expect(screen.getAllByRole('searchbox')).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: discoverFr.explore.submit })).toHaveLength(1)
  })

  it('taper un nom puis « Explorer » rend les homonymes, avec « Ajouter et enrichir » sur chacun', async () => {
    searchByName.mockResolvedValue({ status: 'ok', hits: [MARION, { ...MARION, id: 'apollo-2', title: 'CFO' }] })
    renderWithRouter(<Discover />)
    await explore('Marion Sagnard')

    const results = await screen.findByTestId('person-name-results')
    expect(await within(results).findAllByText(/Marion Sa\*\*\*d/)).toHaveLength(2)
    expect(within(results).getAllByRole('button', { name: discoverFr.personNameSearch.addAndEnrich })).toHaveLength(2)
    expect(searchByName).toHaveBeenCalledWith('Marion Sagnard', undefined)
  })

  it('une entreprise citée (« chez Bedrock ») resserre les homonymes', async () => {
    searchByName.mockResolvedValue({ status: 'ok', hits: [MARION] })
    renderWithRouter(<Discover />)
    await explore('Marion Sagnard chez Bedrock')

    await waitFor(() => expect(searchByName).toHaveBeenCalledWith('Marion Sagnard', 'Bedrock'))
    expect(await screen.findByText(/Marion Sa\*\*\*d/)).toBeInTheDocument()
  })

  it('un nom que personne ne porte : l’écran dit ce qu’il n’a pas trouvé, il ne fabrique aucun homonyme', async () => {
    searchByName.mockResolvedValue({ status: 'empty', hits: [] })
    renderWithRouter(<Discover />)
    await explore('Zyx Qwerty')

    expect(await screen.findByText(/Personne n’a été trouvé sous ce nom : « Zyx Qwerty »/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: discoverFr.personNameSearch.addAndEnrich })).toBeNull()
  })

  it('une recherche qui ne vise pas une personne ne lance aucune recherche par nom', async () => {
    renderWithRouter(<Discover />)
    await explore('cybersécurité Toulouse')

    await waitFor(() => expect(navigate).toHaveBeenCalled())
    expect(searchByName).not.toHaveBeenCalled()
    expect(screen.queryByTestId('person-name-results')).toBeNull()
  })

  it('la demande suivante efface les homonymes de la précédente', async () => {
    searchByName.mockResolvedValue({ status: 'ok', hits: [MARION] })
    renderWithRouter(<Discover />)
    await explore('Marion Sagnard')
    await screen.findByTestId('person-name-results')
    await explore('cybersécurité')
    await waitFor(() => expect(screen.queryByTestId('person-name-results')).toBeNull())
  })

  // #4574.7 — la vue ENTREPRISES lit aussi le nom : « le moteur reconnaît qu'on cherche une personne ».
  it('depuis la vue Entreprises, un nom de personne ouvre la vue des personnes avec ses homonymes', async () => {
    routeSearch = { type: 'accounts' }
    searchByName.mockResolvedValue({ status: 'ok', hits: [MARION] })
    renderWithRouter(<Discover />)
    await explore('Marion Sagnard')

    await waitFor(() => expect(searchByName).toHaveBeenCalledWith('Marion Sagnard', undefined))
    expect(await screen.findByTestId('person-name-results')).toBeInTheDocument()
    expect(navigate).toHaveBeenCalledWith(expect.objectContaining({ search: expect.any(Function) }))
  })

  it('depuis la vue Entreprises, une phrase qui ne vise personne ne lance aucune recherche par nom', async () => {
    routeSearch = { type: 'accounts' }
    renderWithRouter(<Discover />)
    await explore('cybersécurité Toulouse')

    await waitFor(() => expect(navigate).toHaveBeenCalled())
    expect(searchByName).not.toHaveBeenCalled()
  })
})
