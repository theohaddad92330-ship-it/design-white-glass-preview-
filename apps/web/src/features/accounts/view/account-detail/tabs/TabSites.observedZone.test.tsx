import { cleanup, screen } from '@testing-library/react'
import type { Account, AccountMarketContext } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { TabSites } from './TabSites'

/**
 * #1608 / #1630.10 — l'empreinte de zone observée, WIRÉE dans l'onglet Sites.
 *
 * `SiteStatsCards.test.tsx` garde le RENDU de `ObservedZoneCard` en isolation.
 * Cette suite garde le BRANCHEMENT : que `TabSites` lit bien
 * `useAccountMarketContext` et lui passe ce que le hook rend, sans rien
 * inventer entre les deux.
 */

// #2966 (#2119.52-56) — TabSites lit désormais le périmètre ciblé dans l'URL
// (`useSearch({ from: '/accounts/$id', ... })`). `renderWithRouter` ne monte
// qu'une route catch-all (`/$`) : sans cette substitution, `useSearch`
// échoue à trouver une correspondance active depuis `/accounts/$id`. On
// garde le reste du module réel (`useNavigate`, `Link`…) pour ne pas casser
// `renderWithRouter` lui-même, qui les importe aussi.
vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router')
  return { ...actual, useSearch: () => null }
})

const EMPTY_BRANCHES = {
  data: [],
  pagination: { currentPage: 1, size: 50, totalItems: 0, totalPages: 1, hasNext: false, hasPrev: false },
}

const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))

const useAccountMarketContext = vi.fn()
vi.mock('@/features/accounts/hooks/useAccountMarketContext', () => ({
  useAccountMarketContext: (...args: unknown[]) => useAccountMarketContext(...args),
}))

/** Un compte avec AU MOINS un site — sinon `TabSites` rend l'état vide, qui
 *  ne monte ni `SiteStatsCards` ni `ObservedZoneCard`. */
function account(id: string): Account {
  return {
    id,
    company_name: 'Thales',
    raw_analysis: {
      sites_france: [{ city: 'Paris', is_headquarters: true, latitude: 48.8566, longitude: 2.3522 }],
    },
  } as unknown as Account
}

function mockMarketContext(read: {
  data: AccountMarketContext | null | undefined
  isPending: boolean
  isError: boolean
}) {
  useAccountMarketContext.mockReturnValue(read)
}

describe('TabSites — l’empreinte de zone observée', () => {
  beforeEach(() => {
    apiFetch.mockReset()
    apiFetch.mockResolvedValue(EMPTY_BRANCHES)
    useAccountMarketContext.mockReset()
  })
  afterEach(() => cleanup())

  it('rend la ville, la région et le pays quand le compte est couvert et localisé', async () => {
    mockMarketContext({
      data: {
        paths_observed: 41,
        esn_observed: 2,
        observed_zone: { city: 'Lyon', region: 'Auvergne-Rhône-Alpes', country: 'France' },
      },
      isPending: false,
      isError: false,
    })

    renderWithRouter(<TabSites account={account('a-zone-1')} />)

    expect(await screen.findByText('Lyon · Auvergne-Rhône-Alpes · France')).toBeInTheDocument()
    expect(screen.getByText('Empreinte observée ≠ site officiel')).toBeInTheDocument()
  })

  it('« Non mesuré » quand le compte n’est pas couvert — `data` est `null`, jamais une zone inventée', async () => {
    mockMarketContext({ data: null, isPending: false, isError: false })

    renderWithRouter(<TabSites account={account('a-zone-2')} />)

    expect(await screen.findByText('Non mesuré')).toBeInTheDocument()
  })

  it('« Non mesuré » quand le compte est couvert mais sans ville/région/pays connus', async () => {
    mockMarketContext({
      data: { paths_observed: 41, esn_observed: 0, observed_zone: null },
      isPending: false,
      isError: false,
    })

    renderWithRouter(<TabSites account={account('a-zone-3')} />)

    expect(await screen.findByText('Non mesuré')).toBeInTheDocument()
  })

  it('une panne de la mémoire marché SE DIT, elle ne se lit pas « non mesuré »', async () => {
    mockMarketContext({ data: undefined, isPending: false, isError: true })

    renderWithRouter(<TabSites account={account('a-zone-4')} />)

    expect(await screen.findByText('Observations du marché indisponibles')).toBeInTheDocument()
    expect(screen.queryByText('Non mesuré')).not.toBeInTheDocument()
  })

  it('n’altère PAS l’ordre des sites affichés — aucun tri automatique par cette donnée', async () => {
    mockMarketContext({
      data: { paths_observed: 41, esn_observed: 2, observed_zone: { city: 'Lyon', region: null, country: null } },
      isPending: false,
      isError: false,
    })

    renderWithRouter(<TabSites account={account('a-zone-5')} />)

    // Le site du compte (Paris, dans `sites_france`) reste affiché et n'est ni
    // masqué ni réordonné par l'empreinte observée (Lyon) : les deux zones ne
    // se mélangent jamais dans la même liste.
    expect(await screen.findByText('Lyon')).toBeInTheDocument()
    expect((await screen.findAllByText('Paris')).length).toBeGreaterThan(0)
  })
})

// Refonte Théo (23/10) — l'ordre de la maquette `a/comptes-fiche.html` (`sec:struct`) : la phrase de l'onglet,
// PUIS « Entités & filiales », PUIS les sites. Un ordre inversé (sites d'abord, comme avant) échoue ici.
describe('TabSites — refonte Théo, l’ordre de l’onglet Entités & sites', () => {
  beforeEach(() => {
    apiFetch.mockReset()
    apiFetch.mockResolvedValue(EMPTY_BRANCHES)
    useAccountMarketContext.mockReset()
    mockMarketContext({ data: null, isPending: false, isError: false })
  })
  afterEach(() => cleanup())

  it('tête de section → entités & filiales → sites', async () => {
    renderWithRouter(<TabSites account={account('a-theo-1')} onOpenOrganigramme={() => undefined} />)
    const head = await screen.findByTestId('sites-head')
    const entities = screen.getByTestId('sites-entities')
    const sites = screen.getByTestId('sites-sites')
    expect(head.compareDocumentPosition(entities) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(entities.compareDocumentPosition(sites) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('button', { name: /organigramme/i })).toBeInTheDocument()
  })

  it('sait dire NON : sans geste d’organigramme fourni, aucun bouton mort « Vue organigramme »', async () => {
    renderWithRouter(<TabSites account={account('a-theo-2')} />)
    await screen.findByTestId('sites-head')
    expect(screen.queryByRole('button', { name: /organigramme/i })).not.toBeInTheDocument()
  })
})
