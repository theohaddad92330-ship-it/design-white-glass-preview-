import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { MarketWatch as MarketWatchData, WatchedTerritory } from '@bellum/contracts'

const fetchMarketWatch = vi.fn<() => Promise<MarketWatchData>>()

vi.mock('../api/market-watch-api', () => ({
  fetchMarketWatch: () => fetchMarketWatch(),
  followTerritory: vi.fn(),
  unfollowTerritory: vi.fn(),
}))

// #3828.2 — `CreateZoneBlock` lit désormais `useMarketZones`/`useCreateMarketZone`
// (`@/features/market-brief/hooks/useMarketZones`). Une zone déjà présente par
// défaut : les tests de CE fichier portent les territoires, pas les zones —
// la création de zone a son propre describe plus bas, qui redéfinit ce mock.
const listMarketZones = vi.fn().mockResolvedValue([{ id: 'z1', slug: 'lille', label: 'Lille', scope: 'france' }])
const createMarketZone = vi.fn()
vi.mock('@/features/market-brief/hooks/useMarketZones', async () => {
  const { useQuery, useMutation, useQueryClient } = await import('@tanstack/react-query')
  return {
    useMarketZones: () => useQuery({ queryKey: ['market-zones'], queryFn: () => listMarketZones() }),
    useCreateMarketZone: () => {
      const client = useQueryClient()
      return useMutation({
        mutationFn: createMarketZone,
        onSuccess: () => client.invalidateQueries({ queryKey: ['market-zones'] }),
      })
    },
  }
})

// `Link` de TanStack a besoin d'un routeur ; ici on ne teste QUE la destination
// que l'écran choisit, pas le routage lui-même.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, search, children, ...rest }: Record<string, unknown>) => (
    <a
      href={`${String(to)}${search && Object.keys(search as object).length > 0 ? `?${new URLSearchParams(search as Record<string, string>).toString()}` : ''}`}
      {...(rest as Record<string, unknown>)}
    >
      {children as React.ReactNode}
    </a>
  ),
}))

// Refonte Théo — l'en-tête est DÉCLARÉ à la coque : le double rend ce que `CustomerPage` reçoit.
vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({
    pageTitle,
    pageSubtitle,
    pageTitleBadge,
    headerActions,
    children,
  }: {
    pageTitle?: string
    pageSubtitle?: string
    pageTitleBadge?: React.ReactNode
    headerActions?: React.ReactNode
    children: React.ReactNode
  }) => (
    <div>
      <h1>{pageTitle}</h1>
      <p>{pageSubtitle}</p>
      <div data-testid="title-badge">{pageTitleBadge}</div>
      <div data-testid="header-actions">{headerActions}</div>
      {children}
    </div>
  ),
}))

const { MarketWatch, MarketWatchPage } = await import('./MarketWatch')

const measure = (over: Partial<WatchedTerritory['measures'][number]> = {}): WatchedTerritory['measures'][number] =>
  ({
    key: 'offers',
    value: 42,
    bounded: false,
    ceiling: 100,
    registry: 'France Travail',
    observedOn: '2026-08-24',
    trend: { measured: false, gap: 'no_previous_snapshot' },
    structuralTrend: { measured: false, gap: 'not_enough_history' },
    target: { kind: 'route', route: '/discover', search: { signals: 'hiring', department: '31' } },
    ...over,
  }) as WatchedTerritory['measures'][number]

const territory = (over: Partial<WatchedTerritory> = {}): WatchedTerritory => ({
  department: '31',
  lastSnapshotOn: '2026-08-24',
  snapshots: 3,
  measures: [measure()],
  changes: [],
  reason: 'Rien de notable depuis la semaine dernière.',
  esn: { known: 0, resolved: 312, total: 477, bySize: [], byOpenness: [], entries: [] },
  hiringEsn: [],
  technologies: [],
  portfolio: { accountsHere: 0, accountsWithSite: 0, partnersHere: 0 },
  ...over,
})

function wrapPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MarketWatchPage />
    </QueryClientProvider>,
  )
}

function wrap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MarketWatch />
    </QueryClientProvider>,
  )
}

describe('l’écran Marché — un chiffre borné n’est pas un dénombrement', () => {
  it('écrit « au moins 100 » et NOMME sa borne — jamais « 100 » tout court', async () => {
    // Le défaut d'origine, mot pour mot : « Offres IT 100 » sur deux
    // départements. C'est le plafond de la collecte, affiché comme une mesure.
    fetchMarketWatch.mockResolvedValue({
      territories: [territory({ measures: [measure({ value: 100, bounded: true, ceiling: 100 })] })],
    })
    wrap()
    await waitFor(() => expect(screen.getByText('au moins 100')).toBeInTheDocument())
    expect(screen.getByText(/La collecte s'arrête à 100/)).toBeInTheDocument()
    expect(screen.queryByText('100')).toBeNull()
  })

  it('écrit le chiffre nu quand il n’est PAS borné', async () => {
    fetchMarketWatch.mockResolvedValue({ territories: [territory({ measures: [measure({ value: 42 })] })] })
    wrap()
    await waitFor(() => expect(screen.getByText('42')).toBeInTheDocument())
    expect(screen.queryByText(/au moins/)).toBeNull()
  })

  it('écrit « non mesuré » et jamais « 0 » sur une semaine sans mesure', async () => {
    fetchMarketWatch.mockResolvedValue({ territories: [territory({ measures: [measure({ value: null })] })] })
    wrap()
    await waitFor(() =>
      expect(screen.getByText(/non mesuré — la source n'a pas répondu cette semaine/)).toBeInTheDocument(),
    )
    expect(screen.queryByText('0')).toBeNull()
  })
})

describe('l’écran Marché — chaque chiffre porte sa provenance et sa date', () => {
  it('nomme le registre PUBLIC et la date de la photo', async () => {
    fetchMarketWatch.mockResolvedValue({ territories: [territory()] })
    wrap()
    await waitFor(() => expect(screen.getByText(/^source publique · le .+ · France Travail$/)).toBeInTheDocument())
  })
})

describe('l’écran Marché — les tendances entre photos', () => {
  it('DIT pourquoi il n’y a pas de variation, plutôt que d’écrire « +0 »', async () => {
    fetchMarketWatch.mockResolvedValue({
      territories: [
        territory({
          measures: [measure({ value: 100, bounded: true, trend: { measured: false, gap: 'bounded_reading' } })],
        }),
      ],
    })
    wrap()
    await waitFor(() => expect(screen.getByText(/au moins une des deux mesures est bornée/)).toBeInTheDocument())
    expect(screen.queryByText(/\+0/)).toBeNull()
  })

  it('dit « une seule photo » plutôt que rien du tout', async () => {
    fetchMarketWatch.mockResolvedValue({ territories: [territory()] })
    wrap()
    await waitFor(() => expect(screen.getByText(/une seule photo pour l'instant/)).toBeInTheDocument())
  })

  it('affiche la variation ET sa date quand elle est mesurée', async () => {
    fetchMarketWatch.mockResolvedValue({
      territories: [
        territory({
          measures: [
            measure({
              key: 'openTenders',
              value: 9,
              trend: {
                measured: true,
                change: 3,
                percent: 50,
                from: 6,
                to: 9,
                fromDate: '2026-08-17',
                toDate: '2026-08-24',
              },
            }),
          ],
        }),
      ],
    })
    wrap()
    await waitFor(() => expect(screen.getByText(/\+3 depuis le /)).toBeInTheDocument())
    expect(screen.getByText(/50 %/)).toBeInTheDocument()
  })

  it('écrit « stable » sur un zéro MESURÉ — celui-là est vrai', async () => {
    fetchMarketWatch.mockResolvedValue({
      territories: [
        territory({
          measures: [
            measure({
              trend: {
                measured: true,
                change: 0,
                percent: 0,
                from: 6,
                to: 6,
                fromDate: '2026-08-17',
                toDate: '2026-08-24',
              },
            }),
          ],
        }),
      ],
    })
    wrap()
    await waitFor(() => expect(screen.getByText(/stable depuis le /)).toBeInTheDocument())
  })
})

// #2206.42 — deux horizons SÉPARÉS et TITRÉS : le fond (structurel, la plus
// ancienne photo contre la plus récente) et le moment (actuel, inchangé).
describe('l’écran Marché — deux horizons, jamais un seul', () => {
  it('sépare « Tendance de fond » et « Tendance du moment », chacune titrée', async () => {
    fetchMarketWatch.mockResolvedValue({
      territories: [
        territory({
          measures: [
            measure({
              trend: {
                measured: true,
                change: 3,
                percent: 50,
                from: 6,
                to: 9,
                fromDate: '2026-08-17',
                toDate: '2026-08-24',
              },
              structuralTrend: {
                measured: true,
                change: 40,
                percent: 400,
                from: 10,
                to: 50,
                fromDate: '2026-05-01',
                toDate: '2026-08-24',
              },
            }),
          ],
        }),
      ],
    })
    wrap()
    await waitFor(() => expect(screen.getByText('Tendance de fond')).toBeInTheDocument())
    expect(screen.getByText('Tendance du moment')).toBeInTheDocument()
    // Le fond porte l'étendue RÉELLE — depuis la plus ancienne photo, pas
    // depuis la semaine dernière.
    expect(screen.getByText(/\+40 depuis le /)).toBeInTheDocument()
    expect(screen.getByText(/\+3 depuis le /)).toBeInTheDocument()
  })

  it('le fond dit « non mesuré — pas encore assez de recul » avec deux photos ou moins — jamais 0', async () => {
    fetchMarketWatch.mockResolvedValue({
      territories: [
        territory({
          measures: [
            measure({
              structuralTrend: { measured: false, gap: 'not_enough_history' },
            }),
          ],
        }),
      ],
    })
    wrap()
    await waitFor(() => expect(screen.getByText(/pas encore assez de recul/)).toBeInTheDocument())
    expect(screen.queryByText(/\+0/)).toBeNull()
  })
})

describe('l’écran Marché — un mouvement s’écrit en toutes lettres', () => {
  it('écrit « nouvelle entrée » et JAMAIS « — → 1 »', async () => {
    // Le libellé d'origine : « SCC France — — → 1 ». Deux tirets cadratins pour
    // dire « je ne sais pas d'où ça vient » — ce qui est une ENTRÉE.
    fetchMarketWatch.mockResolvedValue({
      territories: [
        territory({
          reason: null,
          changes: [{ kind: 'new_esn', label: 'nouvelle ESN', from: null, to: 1, subject: 'SCC France' }],
        }),
      ],
    })
    wrap()
    await waitFor(() => expect(screen.getByText(/SCC France/)).toBeInTheDocument())
    expect(screen.getByText(/nouvelle entrée sur le territoire/)).toBeInTheDocument()
    expect(screen.queryByText(/—\s*→/)).toBeNull()
  })

  it('écrit une SORTIE quand une ESN a disparu', async () => {
    fetchMarketWatch.mockResolvedValue({
      territories: [
        territory({
          reason: null,
          changes: [{ kind: 'esn_left', label: 'sortie', from: 4, to: null, subject: 'Capgemini' }],
        }),
      ],
    })
    wrap()
    await waitFor(() => expect(screen.getByText(/n'apparaît plus/)).toBeInTheDocument())
  })

  it('garde l’état vide qui DIT POURQUOI', async () => {
    fetchMarketWatch.mockResolvedValue({
      territories: [territory({ reason: 'La veille vient de démarrer — la première photo sera prise lundi.' })],
    })
    wrap()
    await waitFor(() =>
      expect(screen.getByText('La veille vient de démarrer — la première photo sera prise lundi.')).toBeInTheDocument(),
    )
  })
})

describe('l’écran Marché — chaque chiffre MÈNE quelque part', () => {
  it('ouvre la liste de ce que le chiffre compte, cadrée sur le territoire', async () => {
    fetchMarketWatch.mockResolvedValue({
      territories: [
        territory({
          measures: [
            measure({
              key: 'openTenders',
              value: 8,
              target: { kind: 'route', route: '/discover', search: { signals: 'tender', department: '31' } },
            }),
          ],
        }),
      ],
    })
    wrap()
    const link = await screen.findByRole('link', { name: /Appels d'offres ouverts/ })
    expect(link.getAttribute('href')).toBe('/discover?signals=tender&department=31')
  })

  it('ouvre le panneau des ESN — la liste que seul cet écran sert', async () => {
    fetchMarketWatch.mockResolvedValue({
      territories: [
        territory({
          measures: [measure({ key: 'esnPresent', value: 1318, target: { kind: 'panel', panel: 'esn' } })],
          esn: {
            known: 2,
            resolved: 312,
            total: 477,
            bySize: [{ sizeClass: 'eti', count: 2 }],
            byOpenness: [{ openness: 'inconnu', count: 2 }],
            entries: [
              {
                name: 'Astréa Conseil',
                city: 'Toulouse',
                sizeClass: 'eti',
                headcountRange: '250 à 499',
                openToSubcontracting: 'inconnu',
                riskFlag: 'aucun',
              },
            ],
          },
        }),
      ],
    })
    wrap()
    const tile = await screen.findByRole('button', { name: /ESN implantées/ })
    expect(tile.getAttribute('aria-expanded')).toBe('false')
    await userEvent.click(tile)
    await waitFor(() => expect(screen.getByText('Astréa Conseil')).toBeInTheDocument())
    expect(tile.getAttribute('aria-expanded')).toBe('true')
    // La couverture du référentiel accompagne le compte : « 18 ESN ici » sans
    // « 312 résolues sur 477 » se lit comme un territoire vide.
    expect(screen.getByText(/312/)).toBeInTheDocument()
  })
})

describe('l’écran Marché — il n’est plus une île', () => {
  it('mène au portefeuille AVEC son dénominateur', async () => {
    fetchMarketWatch.mockResolvedValue({
      territories: [territory({ portfolio: { accountsHere: 3, accountsWithSite: 11, partnersHere: 1 } })],
    })
    wrap()
    const link = await screen.findByRole('link', { name: /3 comptes de ton portefeuille/ })
    expect(within(link).getByText(/sur 11 comptes qui déclarent un site/)).toBeInTheDocument()
  })

  it('dit franchement quand il n’y a aucun compte ici', async () => {
    fetchMarketWatch.mockResolvedValue({ territories: [territory()] })
    wrap()
    await waitFor(() =>
      expect(screen.getByText('Aucun compte de ton portefeuille ne déclare de site ici.')).toBeInTheDocument(),
    )
  })

  it('mène à l’aperçu complet du territoire', async () => {
    fetchMarketWatch.mockResolvedValue({ territories: [territory()] })
    wrap()
    const link = await screen.findByRole('link', { name: /aperçu complet du territoire/ })
    // #1823 — le territoire a été FUSIONNÉ dans Découvrir : la route dédiée
    // n’existe plus, et l’aperçu complet vit désormais sur `/discover`.
    expect(link.getAttribute('href')).toBe('/discover')
  })
})

// #3828.2 — recette prod : `/api/market-zones` rend `[]` dans un espace réel,
// donc la puce « Marché local » d'un compte n'apparaît jamais ; `POST
// /market-zones` existait déjà côté API, mais rien côté web ne l'appelait.
describe('l’écran Marché — créer une zone quand il n’y en a aucune (#3828.2)', () => {
  it('propose de créer une zone quand l’espace n’en a aucune', async () => {
    listMarketZones.mockResolvedValue([])
    fetchMarketWatch.mockResolvedValue({ territories: [] })
    wrap()
    await waitFor(() => expect(screen.getByText('Créer une zone')).toBeInTheDocument())
  })

  it('ne propose rien quand l’espace a déjà au moins une zone', async () => {
    listMarketZones.mockResolvedValue([{ id: 'z1', slug: 'lille', label: 'Lille', scope: 'france' }])
    fetchMarketWatch.mockResolvedValue({ territories: [] })
    wrap()
    await waitFor(() => expect(screen.getByText(/Tu ne suis aucun territoire/)).toBeInTheDocument())
    expect(screen.queryByText('Créer une zone')).not.toBeInTheDocument()
  })

  it('crée la zone avec le libellé, le pays et les codes saisis', async () => {
    listMarketZones.mockResolvedValue([])
    createMarketZone.mockResolvedValue({ id: 'z2', slug: 'lille', label: 'Lille', scope: 'france' })
    fetchMarketWatch.mockResolvedValue({ territories: [] })
    wrap()
    await screen.findByText('Créer une zone')

    await userEvent.type(screen.getByLabelText('Nom de la zone'), 'Lille')
    await userEvent.type(screen.getByLabelText('Codes de la zone'), '59, 62')
    await userEvent.click(screen.getByRole('button', { name: 'Créer' }))

    await waitFor(() => expect(createMarketZone).toHaveBeenCalled())
    expect(createMarketZone.mock.calls[0][0]).toEqual({
      label: 'Lille',
      scope: 'france',
      departments: ['59', '62'],
      cantons: [],
    })
  })

  it('le bouton reste désactivé tant que le libellé ou les codes manquent', async () => {
    listMarketZones.mockResolvedValue([])
    fetchMarketWatch.mockResolvedValue({ territories: [] })
    wrap()
    await screen.findByText('Créer une zone')
    expect(screen.getByRole('button', { name: 'Créer' })).toBeDisabled()
  })
})

describe('l’écran Marché — les silences', () => {
  it('dit qu’il n’a pas pu lire — jamais une liste vide muette', async () => {
    fetchMarketWatch.mockRejectedValue(new Error('boom'))
    wrap()
    await waitFor(() =>
      expect(screen.getByText('Impossible de lire tes territoires pour le moment.')).toBeInTheDocument(),
    )
  })
})

describe('l’écran Marché — l’en-tête de page (refonte Théo)', () => {
  it('compte les territoires suivis dans une puce — et n’en pose aucune quand il n’y en a pas', async () => {
    fetchMarketWatch.mockResolvedValue({ territories: [] })
    const { unmount } = wrapPage()
    await waitFor(() => expect(screen.getByText(/Tu ne suis aucun territoire/)).toBeInTheDocument())
    expect(screen.getByTestId('title-badge')).toBeEmptyDOMElement()
    unmount()

    fetchMarketWatch.mockResolvedValue({ territories: [territory()] })
    wrapPage()
    await waitFor(() => expect(screen.getByTestId('title-badge')).toHaveTextContent('1 territoire(s) suivi(s)'))
  })

  it('déclare son titre, sa phrase et le geste « Suivre » à la coque — jamais un second en-tête', async () => {
    fetchMarketWatch.mockResolvedValue({ territories: [] })
    wrapPage()
    expect(await screen.findByRole('heading', { level: 1, name: 'Marché' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    const actions = within(screen.getByTestId('header-actions'))
    expect(actions.getByRole('button', { name: 'Suivre' })).toBeInTheDocument()
    expect(actions.getByRole('textbox', { name: 'Département (31, 69…)' })).toBeInTheDocument()
  })

  it('l’ordre des sections : la couverture (structure) avant les territoires (variation), #1635', async () => {
    fetchMarketWatch.mockResolvedValue({ territories: [territory()] })
    wrap()
    const coverage = await screen.findByRole('heading', { level: 2, name: 'Ce que tu sais de ton portefeuille' })
    const territories = screen.getByRole('heading', { level: 2, name: 'Territoires suivis' })
    expect(coverage.compareDocumentPosition(territories) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
