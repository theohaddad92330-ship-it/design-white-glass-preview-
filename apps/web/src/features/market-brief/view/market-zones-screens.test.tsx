import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { marketBriefSchema, type MarketBrief } from '@bellum/contracts'
import lille from '../../../../../../packages/contracts/src/market-brief/lille.fixture.json'

// Parcours « Marchés locaux » (L4b, 05/10/2026) : liste des zones, fiche d'une zone, puce sur la fiche compte.

const listZones = vi.fn()
const getZone = vi.fn()

vi.mock('../api/market-brief-api', () => ({
  listMarketZones: () => listZones(),
  getMarketZone: (id: string) => getZone(id),
}))

vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u1' } }) }))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options ? `${key} ${JSON.stringify(options)}` : key),
  }),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, params, children, ...rest }: Record<string, unknown>) => (
    <a href={`${String(to)}${params ? ` ${JSON.stringify(params)}` : ''}`} {...(rest as Record<string, unknown>)}>
      {children as React.ReactNode}
    </a>
  ),
}))

const { MarketZoneScreen } = await import('./MarketZoneScreen')
const { AccountMarketZoneChip } = await import('./AccountMarketZoneChip')

const brief = (): MarketBrief => marketBriefSchema.parse(structuredClone(lille))

const detail = (over: Record<string, unknown> = {}) => ({
  id: 'z1',
  slug: 'lille',
  label: 'Lille',
  scope: 'france',
  departments: ['59'],
  cantons: [],
  cities: [],
  brief: brief(),
  brief_invalid: false,
  brief_origin: 'seed',
  brief_generated_at: '2026-10-04T10:00:00.000Z',
  linked_accounts: [{ account_id: 'a1', name: 'ADEO', match: 'named_in_brief' }],
  ...over,
})

/** Refonte Théo — la fiche est en VRAIS onglets (Radix : l'onglet s'active à l'appui du bouton gauche). */
async function openTab(key: string) {
  fireEvent.mouseDown(await screen.findByTestId(`market-zone-tab-${key}`), { button: 0 })
}

function wrap(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
}

beforeEach(() => {
  listZones.mockReset()
  getZone.mockReset()
})

describe('MarketZoneScreen', () => {
  it('rend la fiche avec les blocs du brief et les comptes liés cliquables', async () => {
    getZone.mockResolvedValue(detail())
    wrap(<MarketZoneScreen zoneId="z1" />)
    expect(await screen.findByTestId('brief-knowledge')).toBeTruthy()
    expect(screen.queryByTestId('brief-guardrails')).toBeNull()
    await openTab('actors')
    const link = await screen.findAllByRole('link', { name: /ADEO/ })
    expect(link[0]?.getAttribute('href')).toContain('/accounts/$id')
    expect(link[0]?.getAttribute('href')).toContain('"id":"a1"')
  })

  // #3828 — la liste des zones a quitté la navigation (la route redirige vers
  // Pilotage › Marché) : le renvoi de la fiche d'une zone suit la même cible.
  it('le renvoi « ← » mène à Pilotage › Marché, pas à l’ancienne liste (#3828)', async () => {
    getZone.mockResolvedValue(detail())
    wrap(<MarketZoneScreen zoneId="z1" />)
    const back = await screen.findByRole('link', { name: 'zone.back' })
    expect(back.getAttribute('href')).toBe('/accounts/marches')
  })

  // Recette 06/10/2026 — la fiche Lille faisait ~100 000 signes : 453 personnes à plat avant les comptes liés.
  it('les longues listes se replient (dix d’abord, « Voir N de plus »), sans rien retirer', async () => {
    const b = brief()
    b.people = Array.from({ length: 453 }, (_, i) => ({ name: `Personne ${i}`, role: 'external' as const }))
    getZone.mockResolvedValue(detail({ brief: b }))
    wrap(<MarketZoneScreen zoneId="z1" />)
    await openTab('people')
    expect(await screen.findAllByTestId('market-person')).toHaveLength(10)
    fireEvent.click(screen.getByTestId('market-people-more'))
    expect(screen.getAllByTestId('market-person')).toHaveLength(35)
    // Tout reste atteignable : on révèle jusqu'au bout, puis le bouton disparaît.
    for (let i = 0; i < 17; i++) fireEvent.click(screen.getByTestId('market-people-more'))
    expect(screen.getAllByTestId('market-person')).toHaveLength(453)
    expect(screen.queryByTestId('market-people-more')).toBeNull()
  })

  // Recette 06/10/2026 — « Ce que je sais » faisait ~2 700 px avant la grille des prix.
  it('« Ce que je sais » se replie (quatre rubriques, « Voir N de plus »), sans rien retirer', async () => {
    const b = brief()
    b.what_i_know = Array.from({ length: 12 }, (_, i) => ({ rubric: `Rubrique ${i}`, known: 'a', meaning: 'b' }))
    getZone.mockResolvedValue(detail({ brief: b }))
    wrap(<MarketZoneScreen zoneId="z1" />)
    await screen.findByTestId('brief-knowledge')
    expect(screen.getAllByText(/^Rubrique \d+$/)).toHaveLength(4)
    fireEvent.click(screen.getByTestId('brief-knowledge-more'))
    expect(screen.getAllByText(/^Rubrique \d+$/)).toHaveLength(12)
    expect(screen.queryByTestId('brief-knowledge-more')).toBeNull()
  })

  it('une liste courte ne porte aucun bouton', async () => {
    const b = brief()
    b.people = [{ name: 'Seule', role: 'external' }]
    getZone.mockResolvedValue(detail({ brief: b }))
    wrap(<MarketZoneScreen zoneId="z1" />)
    await openTab('people')
    expect(await screen.findAllByTestId('market-person')).toHaveLength(1)
    expect(screen.queryByTestId('market-people-more')).toBeNull()
  })

  it('ordre de lecture : comptes liés avant les longues listes, aucun garde-fou', async () => {
    getZone.mockResolvedValue(detail())
    wrap(<MarketZoneScreen zoneId="z1" />)
    await openTab('actors')
    const linked = await screen.findByTestId('market-linked-accounts')
    const clients = screen.queryByTestId('market-clients')
    if (clients) expect(linked.compareDocumentPosition(clients) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByTestId('brief-guardrails')).toBeNull()
  })

  it('refonte Théo — de vrais onglets : chacun n’affiche que son contenu', async () => {
    getZone.mockResolvedValue(detail())
    wrap(<MarketZoneScreen zoneId="z1" />)
    expect(await screen.findByTestId('brief-knowledge')).toBeTruthy()
    // « Ce que je sais » ouvert : les personnes et les comptes liés n'y sont pas empilés.
    expect(screen.queryByTestId('market-people')).toBeNull()
    expect(screen.queryByTestId('market-linked-accounts')).toBeNull()
    await openTab('people')
    expect(await screen.findByTestId('market-people')).toBeTruthy()
    expect(screen.queryByTestId('brief-knowledge')).toBeNull()
  })

  it('refonte Théo — badge « Décideur » dans la liste des personnes, et seulement pour un décideur', async () => {
    const b = brief()
    b.people = [
      { name: 'Claire Lefort', role: 'decision_maker' },
      { name: 'Paul Brun', role: 'external' },
    ]
    getZone.mockResolvedValue(detail({ brief: b }))
    wrap(<MarketZoneScreen zoneId="z1" />)
    await openTab('people')
    expect(await screen.findAllByTestId('market-person-decision-maker')).toHaveLength(1)
    expect(screen.getByTestId('market-person-decision-maker').closest('tr')).toHaveTextContent('Claire Lefort')
  })

  it('refonte Théo — un onglet sans matière n’existe pas', async () => {
    const b = brief()
    b.people = []
    getZone.mockResolvedValue(detail({ brief: b }))
    wrap(<MarketZoneScreen zoneId="z1" />)
    await screen.findByTestId('market-zone-tab-knowledge')
    expect(screen.queryByTestId('market-zone-tab-people')).toBeNull()
    expect(screen.getByTestId('market-zone-tab-actors')).toBeTruthy()
  })

  it('refonte Théo — l’identité de la fiche : sur-titre, titre, périmètre en puces', async () => {
    getZone.mockResolvedValue(detail())
    wrap(<MarketZoneScreen zoneId="z1" />)
    expect(await screen.findByRole('heading', { level: 1, name: 'title {"zone":"Lille"}' })).toBeTruthy()
    expect(screen.getByTestId('market-zone-chips')).toHaveTextContent('59')
  })

  it('l’en-tête pose une puce du nombre de comptes liés (refonte Théo)', async () => {
    getZone.mockResolvedValue(detail())
    wrap(<MarketZoneScreen zoneId="z1" />)
    expect(await screen.findByText('zone.accountsCount {"count":1}')).toBeTruthy()
  })

  it('un brief absent : l’écran le dit, il ne rend pas de blocs vides', async () => {
    getZone.mockResolvedValue(detail({ brief: null }))
    wrap(<MarketZoneScreen zoneId="z1" />)
    expect(await screen.findByTestId('market-zone-no-brief')).toBeTruthy()
    expect(screen.queryByTestId('brief-knowledge')).toBeNull()
  })

  it('un brief qui ne passe plus le contrat est signalé, jamais servi à moitié', async () => {
    getZone.mockResolvedValue(detail({ brief: null, brief_invalid: true }))
    wrap(<MarketZoneScreen zoneId="z1" />)
    expect(await screen.findByTestId('market-zone-invalid')).toBeTruthy()
  })

  it('une zone introuvable (erreur de lecture) se dit', async () => {
    getZone.mockRejectedValue(new Error('404'))
    wrap(<MarketZoneScreen zoneId="zX" />)
    expect(await screen.findByTestId('market-zone-error')).toBeTruthy()
  })
})

describe('AccountMarketZoneChip', () => {
  it('affiche « Marché local : Lille » quand le compte est lié à une zone', async () => {
    listZones.mockResolvedValue([
      { id: 'z1', slug: 'lille', label: 'Lille', scope: 'france', has_brief: true, brief_generated_at: null },
      { id: 'z2', slug: 'nantes', label: 'Nantes', scope: 'france', has_brief: true, brief_generated_at: null },
    ])
    getZone.mockImplementation(async (id: string) =>
      id === 'z1' ? detail() : detail({ id: 'z2', label: 'Nantes', linked_accounts: [] }),
    )
    wrap(<AccountMarketZoneChip accountId="a1" />)
    const chip = await screen.findByRole('link', { name: /Lille/ })
    expect(chip.getAttribute('href')).toContain('"zoneId":"z1"')
    expect(screen.queryByText(/Nantes/)).toBeNull()
  })

  it('aucune zone liée : la puce se tait (une absence ne fait aucune ligne)', async () => {
    listZones.mockResolvedValue([])
    const { container } = wrap(<AccountMarketZoneChip accountId="a1" />)
    await waitFor(() => expect(listZones).toHaveBeenCalled())
    expect(container.textContent).toBe('')
  })
})
