import { fireEvent, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import type { DiscoverDegradedSource, DiscoverResponse } from '@/features/discover/lib/discover-types'

/* ------------------------------------------------------------------ */
/*  #1766 — LE BANDEAU QUI RASSURE AU-DESSUS DU VIDE                    */
/*                                                                     */
/*  Retour d'un client, le 09/09/2026 à 09:06 : deux signaux cochés,    */
/*  des filtres de taille, des mots-clés, « Rechercher » — puis ZÉRO    */
/*  résultat, surmonté d'un bandeau ambre « Résultats partiels — Les    */
/*  entreprises ci-dessous restent exactes, mais la liste est           */
/*  incomplète ».                                                      */
/*                                                                     */
/*  Il n'y avait aucune entreprise ci-dessous. Les deux moitiés de la    */
/*  phrase étaient fausses, et elles étaient RASSURANTES : elles         */
/*  disaient « la liste est incomplète » là où la seule phrase vraie     */
/*  était « je n'ai rien pu vérifier ».                                 */
/*                                                                     */
/*  L'écran ne connaissait que DEUX affichages de résultat, décidés à    */
/*  deux endroits qui ne se parlaient pas : le bandeau, rendu            */
/*  inconditionnellement dès que `data` existe, et `DiscoverEmpty`,      */
/*  choisi séparément quand `candidates.length === 0`. Il en faut         */
/*  QUATRE — et le quatrième, « aucun résultat ne correspond à tes       */
/*  filtres », ne doit surtout PAS s'afficher quand on n'a pas pu        */
/*  chercher : ce serait accuser les filtres de l'utilisateur d'une      */
/*  panne de fournisseur.                                               */
/*                                                                     */
/*  C'est « non mesuré n'est jamais 0 » appliqué à un écran de           */
/*  recherche : zéro résultat MESURÉ et zéro résultat FAUTE D'AVOIR PU   */
/*  MESURER sont deux affirmations opposées.                            */
/* ------------------------------------------------------------------ */

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

describe('Découvrir — les QUATRE états d’un résultat (#1766)', () => {
  it('des résultats + aucune panne : la liste, sans bandeau', async () => {
    response = answer([candidate('Alpha', '111111111')], [])
    await search()

    expect(await screen.findByText('Alpha')).toBeInTheDocument()
    expect(screen.queryByText(/résultats partiels/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/résultat non vérifiable/i)).not.toBeInTheDocument()
  })

  it('des résultats + une source tombée : plus de « Résultats partiels » (#4639, décision Louis 27/10)', async () => {
    response = answer([candidate('Alpha', '111111111')], [{ source: 'sirene', reason: 'network_error' }])
    await search()

    expect(await screen.findByText('Alpha')).toBeInTheDocument()
    expect(screen.queryByText(/résultats partiels/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/registre officiel des entreprises/)).not.toBeInTheDocument()
    expect(screen.queryByText(/résultat non vérifiable/i)).not.toBeInTheDocument()
  })

  it('ZÉRO résultat + une panne : « Résultat non vérifiable », jamais le bandeau rassurant', async () => {
    response = answer([], [{ source: 'France Travail', reason: 'unauthorized' }])
    await search()

    expect(await screen.findByText(/résultat non vérifiable/i)).toBeInTheDocument()
    // La régression EXACTE de la capture du client.
    expect(screen.queryByText(/résultats partiels/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/ci-dessous restent exactes/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/liste est incomplète/i)).not.toBeInTheDocument()
    // …et surtout PAS l'accusation portée contre les filtres de l'utilisateur.
    expect(screen.queryByText(/aucune entreprise ne correspond/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /élargir la zone/i })).not.toBeInTheDocument()
  })

  it('ZÉRO résultat + une panne : la source tombée est NOMMÉE, avec sa raison', async () => {
    response = answer([], [{ source: 'France Travail', reason: 'unauthorized' }])
    await search()

    // « une source sur cinq » et « tout est tombé » doivent se distinguer.
    expect(await screen.findByText(/offres d’emploi publiques/)).toBeInTheDocument()
    expect(screen.getByText(/refusé/i)).toBeInTheDocument()
  })

  it('ZÉRO résultat + une panne : la seule sortie proposée est de RÉESSAYER', async () => {
    response = answer([], [{ source: 'sirene', reason: 'upstream_error' }])
    await search()

    fireEvent.click(await screen.findByRole('button', { name: /réessayer/i }))
    expect(refetch).toHaveBeenCalled()
  })

  it('ZÉRO résultat + aucune panne : « aucune entreprise ne correspond », qui reste vrai', async () => {
    response = answer([], [])
    await search()

    expect(await screen.findByText(/aucune entreprise ne correspond/i)).toBeInTheDocument()
    expect(screen.queryByText(/résultat non vérifiable/i)).not.toBeInTheDocument()
  })

  /**
   * Défaut VOISIN, trouvé en creusant : une homonymie non tranchée
   * (`kind: 'ambiguous'`) est un verdict rendu sur la DONNÉE, pas une panne de
   * réseau. Elle tombait pourtant dans le même panier que `unreachable`, et le
   * bandeau ambre lui faisait dire « une source n'a pas pu répondre » — faux :
   * la source a parfaitement répondu, c'est nous qui n'avons pas su trancher.
   *
   * Elle empêche quand même de conclure : zéro résultat + homonymies non
   * tranchées n'est PAS « aucune entreprise ne correspond à tes filtres ».
   */
  it('une homonymie non tranchée n’est pas peinte comme une panne', async () => {
    response = answer(
      [candidate('Alpha', '111111111')],
      [{ source: 'siren-resolution', reason: '12 homonymies', count: 12, kind: 'ambiguous' }],
    )
    await search()

    await screen.findByText('Alpha')
    expect(screen.queryByText(/résultats partiels/i)).not.toBeInTheDocument()
    // …mais l'information n'est pas PERDUE pour autant.
    expect(screen.getByText(/homonymie/i)).toBeInTheDocument()
  })

  it('zéro résultat + des homonymies seules : non vérifiable, pas « rien ne correspond »', async () => {
    response = answer([], [{ source: 'siren-resolution', reason: '12 homonymies', count: 12, kind: 'ambiguous' }])
    await search()

    expect(await screen.findByText(/résultat non vérifiable/i)).toBeInTheDocument()
    expect(screen.queryByText(/aucune entreprise ne correspond/i)).not.toBeInTheDocument()
  })
})
