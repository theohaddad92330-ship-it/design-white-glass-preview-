import { fireEvent, render, screen } from '@testing-library/react'
import type { MarketContextMatch } from '@bellum/contracts'
import { useEsnProfile } from '@/features/profile/hooks/useEsnProfile'
import { useMarketContextSearch } from '@/features/search/hooks/useMarketContextSearch'
import { MarketAwarenessCard } from './MarketAwarenessCard'

/**
 * #1627 — LA PREMIÈRE VALEUR MARCHÉ, À L'ONBOARDING.
 *
 * Ces tests gardent surtout les TROIS interdits que le retour pose lui-même :
 * pas de compte créé, pas d'analyse lancée, jamais « opportunités » ni « ils
 * recrutent aujourd'hui ». Ils sont respectés par ABSENCE de code qui les
 * ferait (aucune mutation dans ce composant) ; ce fichier garde le vocabulaire
 * et le silence non bloquant.
 *
 * ⚠️ Les fixtures de profil sont les libellés EXACTS du questionnaire
 * (`onboarding/lib/questions.ts`), pas des mots courts écrits à la main : c'est
 * précisément l'écart entre les deux qui rendait cette carte morte en
 * production (voir `market-awareness.ts`).
 */
const navigate = vi.fn()
vi.mock('@tanstack/react-router', async importOriginal => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return { ...actual, useNavigate: () => navigate }
})
vi.mock('@/features/profile/hooks/useEsnProfile', () => ({ useEsnProfile: vi.fn() }))
vi.mock('@/features/search/hooks/useMarketContextSearch', () => ({ useMarketContextSearch: vi.fn() }))

const ZONE_LYON = 'Lyon & Auvergne-Rhône-Alpes'
const ZONE_REMOTE = 'Full remote (pas de contrainte géo)'
const EXPERTISE_DATA = 'Data & Intelligence Artificielle'
const EXPERTISE_CLOUD = 'Cloud & Infrastructure (AWS, Azure, GCP, Hosting)'

function mockEsnAnswers(overrides: { expertise_areas?: string[]; geo_zones?: string[] } = {}) {
  vi.mocked(useEsnProfile).mockReturnValue({
    data: { expertise_areas: [], geo_zones: [], ...overrides },
  } as unknown as ReturnType<typeof useEsnProfile>)
}

function mockSearch(state: { data?: unknown; isPending?: boolean }) {
  vi.mocked(useMarketContextSearch).mockReturnValue({
    data: state.data,
    isPending: state.isPending ?? false,
  } as unknown as ReturnType<typeof useMarketContextSearch>)
}

/** Un résultat de la MÊME forme que `MarketContextMatch` — pile observée comprise. */
function match(
  companyName: string,
  observedStack: readonly string[] = [],
  esnObserved: readonly string[] = [],
): MarketContextMatch {
  return {
    companyName,
    coverage: {
      covered: true,
      marketPaths: 12,
      esnObserved: esnObserved.map(esnName => ({ esnName, persons: 2, certainty: 'moyenne' as const })),
      observedStack: observedStack.map(techno => ({ techno, persons: 4 })),
      roleFamilies: [],
      exEsnPresent: null,
      observedZone: null,
    },
  } satisfies MarketContextMatch
}

beforeEach(() => {
  navigate.mockReset()
})

describe('MarketAwarenessCard', () => {
  it('ne rend RIEN sans expertise ni zone déclarée — jamais bloquant', () => {
    mockEsnAnswers()
    mockSearch({ data: undefined })
    const { container } = render(<MarketAwarenessCard />)
    expect(container).toBeEmptyDOMElement()
  })

  it('ne rend rien pendant la lecture — pas de flash avant la réponse', () => {
    mockEsnAnswers({ geo_zones: [ZONE_LYON] })
    mockSearch({ data: undefined, isPending: true })
    const { container } = render(<MarketAwarenessCard />)
    expect(container).toBeEmptyDOMElement()
  })

  it('ne rend rien sur une panne ou un corpus vide — jamais un état d’erreur à l’onboarding', () => {
    mockEsnAnswers({ geo_zones: [ZONE_LYON] })
    mockSearch({ data: { status: 'unavailable', reason: 'read_failed' } })
    expect(render(<MarketAwarenessCard />).container).toBeEmptyDOMElement()

    mockSearch({ data: { status: 'ok', matches: [] } })
    expect(render(<MarketAwarenessCard />).container).toBeEmptyDOMElement()
  })

  it('affiche le compte d’environnements et le CTA quand le corpus répond', () => {
    mockEsnAnswers({ expertise_areas: [EXPERTISE_DATA], geo_zones: [ZONE_LYON] })
    mockSearch({ data: { status: 'ok', matches: [match('A'), match('B'), match('C')] } })
    render(<MarketAwarenessCard />)
    expect(screen.getByText(/connaît déjà 3 environnements de marché/)).toBeInTheDocument()
    expect(screen.getByText('Voir mes premières pistes')).toBeInTheDocument()
    expect(screen.getByText('cette consultation est incluse')).toBeInTheDocument()
    expect(screen.queryByText(/crédit/i)).not.toBeInTheDocument()
  })

  // #2074.26 — « 0 crédit, aucun compte créé automatiquement » : la carte ne
  // fait qu'une LECTURE, elle le DIT — à côté de la gratuité déjà affichée.
  it('#2074.26 — dit qu’aucun compte n’est créé automatiquement, à côté de la gratuité', () => {
    mockEsnAnswers({ expertise_areas: [EXPERTISE_DATA], geo_zones: [ZONE_LYON] })
    mockSearch({ data: { status: 'ok', matches: [match('A'), match('B'), match('C')] } })
    render(<MarketAwarenessCard />)
    expect(screen.getByText('aucun compte n’est créé automatiquement')).toBeInTheDocument()
  })

  it('⚠️ nomme la ZONE COUPÉE, pas le libellé composé du questionnaire', () => {
    mockEsnAnswers({ geo_zones: [ZONE_LYON] })
    mockSearch({ data: { status: 'ok', matches: [match('A')] } })
    render(<MarketAwarenessCard />)
    expect(screen.getByText(/Autour de Lyon/)).toBeInTheDocument()
    expect(screen.queryByText(/Auvergne-Rhône-Alpes/)).not.toBeInTheDocument()
  })

  it('NOMME les expertises déclarées que la pile observée recoupe — jamais une gradation', () => {
    mockEsnAnswers({ expertise_areas: [EXPERTISE_DATA, EXPERTISE_CLOUD], geo_zones: [ZONE_LYON] })
    mockSearch({
      data: { status: 'ok', matches: [match('A', ['Data', 'Kubernetes']), match('B', ['Snowflake'])] },
    })
    render(<MarketAwarenessCard />)
    expect(screen.getByText(new RegExp(EXPERTISE_DATA.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeInTheDocument()
    // Aucune gradation : `MarketStructuralFitCard` a déjà tranché cette question.
    expect(screen.queryByText(/forte affinité/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/affinité moyenne/i)).not.toBeInTheDocument()
  })

  it('ne NOMME aucune expertise quand rien ne recoupe — « non mesuré » ne s’invente pas', () => {
    mockEsnAnswers({ expertise_areas: [EXPERTISE_DATA], geo_zones: [ZONE_LYON] })
    mockSearch({ data: { status: 'ok', matches: [match('A', ['Mainframe'])] } })
    render(<MarketAwarenessCard />)
    expect(screen.getByText(/connaît déjà 1 environnement de marché/)).toBeInTheDocument()
    expect(
      screen.queryByText(new RegExp(EXPERTISE_DATA.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))),
    ).not.toBeInTheDocument()
  })

  it('⚠️ jamais « opportunités » ni « ils recrutent aujourd’hui » — les deux formulations interdites par le retour', () => {
    mockEsnAnswers({ expertise_areas: [EXPERTISE_DATA], geo_zones: [ZONE_LYON] })
    mockSearch({ data: { status: 'ok', matches: [match('A')] } })
    render(<MarketAwarenessCard />)
    expect(screen.queryByText(/opportunité/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/recrutent aujourd.hui/i)).not.toBeInTheDocument()
  })

  /**
   * #2090.44 — DÉCISION Louis 22/09 soir (decisions-louis-22-09-soir.md §1,
   * reco appliquée) : le retour demandait la phrase « Ces entreprises ne sont
   * pas encore des opportunités », mais le mot lui-même reste interdit sur cet
   * écran (test ci-dessus, garde ANTÉRIEURE) — même en négation, « ne sont pas
   * encore des opportunités » CONTIENT le mot. Le sens demandé (ce n'est
   * qu'un premier repérage, pas une liste qualifiée) est rendu SANS lui.
   */
  it('#2090.44 — dit que ces environnements ne sont pas encore des comptes suivis, sans le mot interdit', () => {
    mockEsnAnswers({ expertise_areas: [EXPERTISE_DATA], geo_zones: [ZONE_LYON] })
    mockSearch({ data: { status: 'ok', matches: [match('A')] } })
    render(<MarketAwarenessCard />)
    expect(screen.getByText(/ne sont pas encore des comptes suivis/)).toBeInTheDocument()
    expect(screen.queryByText(/opportunité/i)).not.toBeInTheDocument()
  })

  it('le CTA navigue vers Découvrir, prérempli avec le MÊME discriminant — jamais une analyse lancée', () => {
    mockEsnAnswers({ expertise_areas: [EXPERTISE_DATA], geo_zones: [ZONE_LYON] })
    mockSearch({ data: { status: 'ok', matches: [match('A')] } })
    render(<MarketAwarenessCard />)
    screen.getByText('Voir mes premières pistes').click()
    expect(navigate).toHaveBeenCalledWith({ to: '/discover', search: { mc_location: 'Lyon' } })
  })

  it('sans zone territoriale, le discriminant est l’expertise — et le CTA la porte', () => {
    mockEsnAnswers({ expertise_areas: [EXPERTISE_CLOUD], geo_zones: [ZONE_REMOTE] })
    mockSearch({ data: { status: 'ok', matches: [match('A')] } })
    render(<MarketAwarenessCard />)
    screen.getByText('Voir mes premières pistes').click()
    expect(navigate).toHaveBeenCalledWith({ to: '/discover', search: { mc_technology: 'Cloud' } })
  })

  /**
   * R15N-12 — mesuré en production : « Bellum connaît déjà 20 environnements
   * de marché » suivi de « L'environnement observé de 20 d'entre eux retrouve
   * tes expertises… » — le même nombre deux fois à trois mots d'intervalle,
   * et « d'entre eux » dont l'antécédent vit dans le TITRE au-dessus. Le
   * calcul est juste (`environnementsWithFit === read.matches.length`) ; la
   * phrase ne le disait pas.
   */
  it('quand TOUS les environnements retrouvent l’expertise, la phrase le dit — jamais le même nombre deux fois', () => {
    mockEsnAnswers({ expertise_areas: [EXPERTISE_DATA], geo_zones: [ZONE_LYON] })
    mockSearch({ data: { status: 'ok', matches: [match('A', ['Data']), match('B', ['Data'])] } })
    render(<MarketAwarenessCard />)
    expect(screen.getByText(/connaît déjà 2 environnements de marché/)).toBeInTheDocument()
    expect(screen.getByText(/Les 2 retrouvent tes expertises déclarées/)).toBeInTheDocument()
    expect(screen.queryByText(/d.entre eux/)).not.toBeInTheDocument()
  })

  it('quand SEULE une partie retrouve l’expertise, la fraction reste affichée', () => {
    mockEsnAnswers({ expertise_areas: [EXPERTISE_DATA], geo_zones: [ZONE_LYON] })
    mockSearch({ data: { status: 'ok', matches: [match('A', ['Data']), match('B', ['Mainframe'])] } })
    render(<MarketAwarenessCard />)
    expect(screen.getByText(/connaît déjà 2 environnements de marché/)).toBeInTheDocument()
    expect(screen.getByText(/1 d.entre eux retrouve tes expertises déclarées/)).toBeInTheDocument()
  })

  /**
   * #2074.21 — RECOURS EXTERNE OBSERVÉ, sur la carte ET en filtre (Louis
   * 15/09, contre la recommandation). `coverage.esnObserved` porte déjà cette
   * donnée (GA-259/c65) : jamais « recours externe » nu, toujours qualifié
   * « … observé dans nos sources » — un libellé se lit hors contexte.
   */
  it('#2074.21 — montre le compte de recours externe observé, jamais le mot nu', () => {
    mockEsnAnswers({ expertise_areas: [EXPERTISE_DATA], geo_zones: [ZONE_LYON] })
    mockSearch({
      data: {
        status: 'ok',
        matches: [match('A', ['Data'], ['Capgemini']), match('B', ['Data']), match('C', ['Data'], ['Sopra'])],
      },
    })
    render(<MarketAwarenessCard />)
    expect(screen.getByText(/2 environnements avec un recours externe observé dans nos sources/)).toBeInTheDocument()
  })

  it('#2074.21 — n’affiche rien sur le recours externe quand aucun n’est observé', () => {
    mockEsnAnswers({ expertise_areas: [EXPERTISE_DATA], geo_zones: [ZONE_LYON] })
    mockSearch({ data: { status: 'ok', matches: [match('A', ['Data'])] } })
    render(<MarketAwarenessCard />)
    expect(screen.queryByText(/recours externe/i)).not.toBeInTheDocument()
  })

  it('#2074.21 — le filtre « recours externe observé uniquement » restreint le compte ET le CTA', () => {
    mockEsnAnswers({ expertise_areas: [EXPERTISE_DATA], geo_zones: [ZONE_LYON] })
    mockSearch({
      data: {
        status: 'ok',
        matches: [match('A', ['Data'], ['Capgemini']), match('B', ['Data'])],
      },
    })
    render(<MarketAwarenessCard />)
    expect(screen.getByText(/connaît déjà 2 environnements de marché/)).toBeInTheDocument()

    fireEvent.click(screen.getByText('Recours externe observé uniquement'))
    expect(screen.getByText(/connaît déjà 1 environnement de marché/)).toBeInTheDocument()

    screen.getByText('Voir mes premières pistes').click()
    expect(navigate).toHaveBeenCalledWith({ to: '/discover', search: { mc_location: 'Lyon', mc_esnOnly: 'true' } })
  })
})
