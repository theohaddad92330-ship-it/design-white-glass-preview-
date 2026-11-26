import { cleanup, fireEvent, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import type { DiscoverDegradedSource, DiscoverResponse } from '@/features/discover/lib/discover-types'

/* #4639 (Louis, 27/10) — « Résultats partiels » (les PANNES de source) ne s'affiche plus sur /discover.
   Les quatre autres affirmations du repli restent : homonymes (#1766), non examinées, secteur non
   exprimé, offres non lues (#4045). Le contrat `degraded` serveur ne change pas. */

vi.mock('@/routes/discover/index', () => ({ Route: { useSearch: () => ({}) } }))

const motionComponents = new Map<string, unknown>()
vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: (_target: unknown, prop: string) => {
        if (typeof prop === 'string') {
          const cached = motionComponents.get(prop)
          if (cached) return cached
          const Rendered = ({ children, ...props }: Record<string, unknown> & { children?: unknown }) => {
            const Component = prop as unknown as React.ElementType
            return <Component {...props}>{children as React.ReactNode}</Component>
          }
          motionComponents.set(prop, Rendered)
          return Rendered
        }
      },
    },
  ),
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  useInView: () => true,
  useScroll: () => ({ scrollYProgress: { get: () => 0 } }),
  useTransform: () => 0,
}))

/** La réponse que l'écran recevra — réglée test par test. */
let response: DiscoverResponse | undefined
const refetch = vi.fn()

vi.mock('@/features/discover/hooks/useDiscoverSearch', () => ({
  useDiscoverSearch: () => ({ data: response, isFetching: false, isError: false, refetch }),
}))

// Importé APRÈS les mocks — l'écran doit voir le hook mocké.
const { Discover } = await import('./Discover')

function answer(candidates: DiscoverResponse['candidates'], degraded: DiscoverDegradedSource[]): DiscoverResponse {
  return { candidates, query: {}, degraded, coverage: null }
}

/** Un candidat minimal : ce test ne parle que du CADRE, pas de la carte. */
function candidate(name: string, siren: string) {
  return {
    name,
    siren,
    nafCode: '62.01Z',
    sector: null,
    city: null,
    department: null,
    headcountRange: null,
    creationDate: null,
    score: null,
    scoreMax: null,
    scoreUnmeasured: [],
    scoreFactors: [],
    signals: [],
    dataConfidence: null,
    angle: null,
    suggestedRoles: [],
    portfolioState: 'new' as const,
    accountId: null,
    sources: [],
  }
}

/** Le geste exact du client : un preset qui coche un signal d'intention, donc
 *  une recherche RÉELLEMENT lancée (`request !== null`) en mode Signaux.
 *  #2504 (17/09/2026) — les pistes rapides vivent dans une modale : ouvrir le
 *  bouton « Pistes rapides » avant de choisir la piste dedans. */
async function search() {
  renderWithRouter(<Discover />)
  fireEvent.click(await screen.findByRole('button', { name: /pistes rapides/i }))
  fireEvent.click(await screen.findByRole('button', { name: /comptes qui recrutent/i }))
  // #4490 (26/10) — une piste POSE les critères et s'arrête là : aucun appel sans geste.
  // C'est « Explorer » qui lance, donc le test le clique aussi.
  fireEvent.click(await screen.findByRole('button', { name: 'Explorer' }))
}

beforeEach(() => {
  response = undefined
  refetch.mockClear()
})

beforeEach(() => {
  response = undefined
  refetch.mockClear()
})

describe('Découvrir — une panne de source ne se montre plus (#4639)', () => {
  it('une source tombée : ni « Résultats partiels », ni sa phrase, ni « Détail »', async () => {
    response = answer([candidate('Alpha', '111111111')], [{ source: 'sirene', reason: 'network_error' }])
    await search()

    await screen.findByText('Alpha')
    expect(screen.queryByText(/résultats partiels/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/n’a pas abouti/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^détail$/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/registre officiel des entreprises/)).not.toBeInTheDocument()
  })

  it('la panne n’ouvre plus le repli d’office, et ne compte pas parmi ses points', async () => {
    response = answer([candidate('Alpha', '111111111')], [])
    const first = await (async () => {
      await search()
      await screen.findByText('Alpha')
      return screen.queryByTestId('discover-quality')?.textContent ?? null
    })()
    cleanup()

    response = answer([candidate('Alpha', '111111111')], [{ source: 'sirene', reason: 'network_error' }])
    await search()
    await screen.findByText('Alpha')
    const notes = screen.queryByTestId('discover-quality')
    // Même repli, même compteur qu'SANS panne : elle ne pèse plus ni sur l'ouverture ni sur les points.
    expect(notes?.textContent ?? null).toBe(first)
    expect(notes?.hasAttribute('open') ?? false).toBe(false)
  })

  it('une homonymie SEULE continue d’être dite', async () => {
    response = answer(
      [candidate('Alpha', '111111111')],
      [{ source: 'siren-resolution', reason: '12 homonymies', count: 12, kind: 'ambiguous' }],
    )
    await search()

    await screen.findByText('Alpha')
    expect(screen.getByText(/ont pas pu être identifiées/i)).toBeInTheDocument()
  })

  it('une panne ET des homonymes : les homonymes sont toujours rendus, la panne non', async () => {
    response = answer(
      [candidate('Alpha', '111111111')],
      [
        { source: 'sirene', reason: 'network_error' },
        { source: 'siren-resolution', reason: '12 homonymies', count: 12, kind: 'ambiguous' },
      ],
    )
    await search()

    await screen.findByText('Alpha')
    expect(screen.getByText(/ont pas pu être identifiées/i)).toBeInTheDocument()
    expect(screen.queryByText(/résultats partiels/i)).not.toBeInTheDocument()
  })

  it('zéro résultat + une panne : l’écran dit toujours pourquoi (DiscoverUnverifiable)', async () => {
    response = answer([], [{ source: 'sirene', reason: 'upstream_error' }])
    await search()

    expect(await screen.findByText(/résultat non vérifiable/i)).toBeInTheDocument()
  })
})
