import { orgGraphSchema, type AccountMarketContext, type Contact, type KnownPeople } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { formatDate } from '@/lib/locale'
import { OrgInfluenceMap } from './OrgInfluenceMap'
import { buildOrgInfluenceMap } from './orgInfluenceMapData'
import { chooseOption } from '@/test/select'

// La recherche ciblée d'une zone blanche passe par la mutation `enrich-contacts`
// existante ; on la remplace ici pour observer le scope RÉELLEMENT envoyé.
const mockEnrichMutate = vi.fn()
vi.mock('@/features/accounts/hooks/useEnrichAccount', () => ({
  useEnrichContacts: () => ({ mutate: mockEnrichMutate, isPending: false }),
}))

/**
 * #2837 — la mémoire marché de l'ENTREPRISE (pas d'une entité précise, voir
 * `marketMemoryState` plus bas). Même hook, même contrat que
 * `AccountMarketMemoryCard` (`useAccountMarketContext`) : un état par défaut
 * silencieux (`data: undefined, isPending: false, isError: false` → « Non
 * mesuré ») pour ne perturber aucun des tests existants de ce fichier, qui
 * n'attendent rien de la mémoire marché.
 */
type MarketMemoryQueryState = { data?: AccountMarketContext | null; isPending: boolean; isError: boolean }
const marketMemoryState: { current: MarketMemoryQueryState } = {
  current: { data: undefined, isPending: false, isError: false },
}
vi.mock('@/features/accounts/hooks/useAccountMarketContext', () => ({
  useAccountMarketContext: () => marketMemoryState.current,
}))

// #4072.1 — « Déjà connu » : le lecteur des personnes connues de l'espace, piloté par chaque test.
const knownPeopleState: { current: KnownPeople | null } = { current: null }
vi.mock('@/features/account-facts/useKnownPeople', () => ({
  useKnownPeople: () => knownPeopleState.current,
}))

/**
 * La maquette p20 (« Carte d'influence — cible UI ») est la spécification de ce
 * rendu. Ce que ces tests verrouillent, c'est ce que le commercial DOIT voir et
 * que l'arbre plat ne montrait pas : une racine qui est une ENTITÉ, des colonnes
 * par entité, un pourcentage de confiance DANS chaque nœud, un badge de niveau
 * structurel, et le trou de couverture posé à sa place hiérarchique.
 */
const GRAPH = orgGraphSchema.parse({
  graphVersion: 1,
  entities: [
    { id: 'e-groupe', name: 'Groupe TF1', type: 'groupe', parentId: null, confidence: 92, status: 'operating' },
    { id: 'e-pub', name: 'TF1 Pub', type: 'filiale', parentId: 'e-groupe', confidence: 80, status: 'operating' },
    { id: 'e-vieux', name: 'Ancienne filiale', type: 'filiale', parentId: 'e-groupe', confidence: 60, status: 'ceded' },
  ],
  people: [
    {
      id: 'p-alice',
      fullName: 'Alice Directrice',
      title: 'Directrice générale',
      entityId: 'e-groupe',
      hierarchyLevel: 'L1',
      family: 'Direction',
      decisionRoles: ['economic_buyer'],
      identityStatus: 'classified',
      confidence: 92,
    },
    {
      id: 'p-bruno',
      fullName: 'Bruno Adtech',
      title: 'Head of Adtech',
      entityId: 'e-pub',
      hierarchyLevel: 'L2',
      family: 'Data / Adtech',
      decisionRoles: ['technical_buyer'],
      identityStatus: 'classified',
      confidence: 73,
    },
    {
      id: 'p-inconnu',
      fullName: 'Zoe Inconnue',
      identityStatus: 'verified_identity',
      decisionRoles: [],
      confidence: 50,
    },
  ],
  hierarchyEdges: [],
  influenceEdges: [],
  buyingCommittee: [],
  uncoveredZones: [
    {
      entityId: 'e-pub',
      family: 'Achats',
      hierarchyLevel: 'L5',
      importance: 'critique',
      reason: 'Aucun contact achats identifié chez TF1 Pub',
      suggestedTitles: ['Responsable achats IT'],
      suggestedQueries: [],
    },
  ],
  recommendedPath: [],
  rejectedItems: [],
})

/** La carte consomme la mutation de recherche ciblée : elle vit sous un
 *  QueryClient comme partout dans l'app. */
function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

function renderMap(contacts?: React.ComponentProps<typeof OrgInfluenceMap>['contacts']) {
  const map = buildOrgInfluenceMap(GRAPH)
  if (!map) throw new Error('fixture invalide : la carte doit se construire')
  return renderWithClient(<OrgInfluenceMap map={map} contacts={contacts} />)
}

const tr = (key: string, options?: Record<string, unknown>) => i18n.t(`accountOrg:orgMap.${key}`, options ?? {})

describe('OrgInfluenceMap — maquette p20', () => {
  it('met une ENTITÉ au sommet, pas un contact', () => {
    const { container } = renderMap()
    const body = container.textContent ?? ''
    expect(body).toContain('Groupe TF1')
    expect(body).toContain(tr('entityTypes.groupe'))
  })

  it('affiche le pourcentage de confiance DANS chaque nœud, entités comprises', () => {
    const { container } = renderMap()
    const body = container.textContent ?? ''
    // 92 (groupe ET dirigeante), 80 (BU), 73 (poste) — la maquette les chiffre tous.
    expect(body).toContain(tr('confidence', { value: 92 }))
    expect(body).toContain(tr('confidence', { value: 80 }))
    expect(body).toContain(tr('confidence', { value: 73 }))
  })

  it('porte le badge de niveau STRUCTUREL, pas seulement le rôle d’achat', () => {
    const { container } = renderMap()
    const body = container.textContent ?? ''
    expect(body).toContain(tr('levels.L1'))
    expect(body).toContain(tr('levels.L2'))
  })

  it('avoue son ignorance au lieu de la combler', () => {
    const { container } = renderMap()
    const body = container.textContent ?? ''
    // Personne sans niveau ni rôle : niveau inconnu + colonne « rattachement inconnu ».
    expect(body).toContain(tr('levelUnknown'))
    expect(body).toContain(tr('unassigned'))
  })

  it('pose le trou de couverture À SA PLACE, avec le poste à chercher', () => {
    const { container } = renderMap()
    const body = container.textContent ?? ''
    expect(body).toContain(tr('toVerify'))
    expect(body).toContain('Responsable achats IT')
  })

  it('statue une entité cédée au lieu de la présenter comme active', () => {
    const { container } = renderMap()
    expect(container.textContent ?? '').toContain(tr('entityStatus.ceded'))
  })

  it('porte la légende de couleurs de la maquette et la clause du pointillé', () => {
    const { container } = renderMap()
    const body = container.textContent ?? ''
    expect(body).toContain(tr('legend.sponsor'))
    expect(body).toContain(tr('legend.entity'))
    expect(body).toContain(tr('legend.field'))
    expect(body).toContain(tr('legend.procurement'))
    expect(body).toContain(tr('legend.inferred'))
  })

  it('explore par métier : le filtre retire ce qui n’en relève pas', async () => {
    const user = userEvent.setup()
    renderMap()
    await chooseOption(screen.getByLabelText(tr('filters.family')), 'Data / Adtech')
    const canvas = screen.getByTestId('org-map-canvas').textContent ?? ''
    expect(canvas).toContain('Bruno Adtech')
    expect(canvas).not.toContain('Alice Directrice')
    // La structure reste : on explore une branche, on ne perd pas le groupe.
    expect(canvas).toContain('Groupe TF1')
  })

  it('explore par entité : les autres colonnes disparaissent, la racine reste', async () => {
    const user = userEvent.setup()
    renderMap()
    await chooseOption(screen.getByLabelText(tr('filters.entity')), 'e-pub')
    const canvas = screen.getByTestId('org-map-canvas').textContent ?? ''
    expect(canvas).toContain('TF1 Pub')
    expect(canvas).toContain('Groupe TF1')
    expect(canvas).not.toContain('Ancienne filiale')
  })

  /* ── « Chaque nœud porte source, date, statut, confiance » (DoD p32) ─────── */

  it('nomme le RÔLE D’ACHAT sur le nœud, pas seulement par la couleur', () => {
    const { container } = renderMap()
    const body = container.textContent ?? ''
    expect(body).toContain(i18n.t('accountOrg:orgGraph.roles.economic_buyer'))
    expect(body).toContain(i18n.t('accountOrg:orgGraph.roles.technical_buyer'))
  })

  it('affiche le statut d’identité — un « À qualifier » n’est pas un contact prêt', () => {
    const { container } = renderMap()
    const body = container.textContent ?? ''
    expect(body).toContain(tr('identityStatus.classified'))
    expect(body).toContain(tr('identityStatus.verified_identity'))
  })

  it('R46 point 6 — les puces d’une carte tiennent sur UNE rangée, le surplus se compte « +N » avec la liste complète', () => {
    const { container } = renderMap()
    const alice = within(container.querySelector('[data-org-person]') as HTMLElement)
    const row = alice.getByTestId('org-person-chips')
    expect(row.className).toContain('flex-nowrap')
    const more = alice.getByTestId('org-person-chips-more')
    expect(more.textContent).toContain('+2')
    // niveau, statut, rôle d’achat, famille : rien n’est perdu, tout est nommé dans le title.
    expect(more.getAttribute('title')).toContain(i18n.t('accountOrg:orgGraph.roles.economic_buyer'))
    expect(more.getAttribute('title')).toContain('Direction')
    expect(container.querySelectorAll('[data-testid="org-person-chips"]').length).toBeGreaterThan(1)
  })

  it('#4072.1 — « Déjà connu : dans ton CRM » sur la carte d’influence quand la source est le CRM, jamais deviné', () => {
    knownPeopleState.current = {
      people: [{ fullName: 'Alice Directrice', reasons: ['crm'], lastDate: '2026-09-26' }],
    } as KnownPeople
    let first: ReturnType<typeof renderMap>
    try {
      first = renderMap()
      const markers = screen.getAllByTestId('org-person-known')
      expect(markers).toHaveLength(1)
      expect(markers[0]?.textContent).toContain(i18n.t('accountOrg:focal.knownCrm'))
    } finally {
      knownPeopleState.current = null
    }
    first.unmount()
    renderMap()
    expect(screen.queryByTestId('org-person-known')).toBeNull()
  })

  it('cite la source datée du nœud quand le graphe la porte', () => {
    const graph = orgGraphSchema.parse({
      ...GRAPH,
      entities: [
        {
          id: 'e-groupe',
          name: 'Groupe TF1',
          type: 'groupe',
          parentId: null,
          confidence: 92,
          status: 'operating',
          country: 'FR',
          sources: [{ id: 's-site', kind: 'official_site', grounding: 'A', date: '2026-05-12' }],
        },
      ],
      people: [],
      uncoveredZones: [],
    })
    const map = buildOrgInfluenceMap(graph)!
    const { container } = renderWithClient(<OrgInfluenceMap map={map} />)
    const body = container.textContent ?? ''
    expect(body).toContain(i18n.t('accountOrg:orgGraph.sourceKinds.official_site'))
    expect(body).toContain(formatDate('2026-05-12', { dateStyle: 'medium' }) as string)
    // Le pays vérifié de l'ontologie p6.
    expect(body).toContain('FR')
  })

  it('chiffre le stock estimé d’une zone blanche, et n’invente rien sans lui', () => {
    const withStock = orgGraphSchema.parse({
      ...GRAPH,
      uncoveredZones: [
        {
          entityId: 'e-pub',
          family: 'Achats',
          hierarchyLevel: 'L5',
          importance: 'critique',
          reason: 'Aucun contact achats identifié chez TF1 Pub',
          suggestedTitles: ['Responsable achats IT'],
          suggestedQueries: ['Responsable achats TF1 Pub'],
          estimatedAvailable: 30,
        },
      ],
    })
    const { container } = renderWithClient(<OrgInfluenceMap map={buildOrgInfluenceMap(withStock)!} />)
    const body = container.textContent ?? ''
    expect(body).toContain(tr('estimatedStock', { count: 30 }))
    expect(body).toContain('Responsable achats TF1 Pub')
    expect(body).toContain(tr('importance.critique'))

    // Sans estimation dans le graphe, aucun chiffre n'est affiché.
    const { container: bare } = renderWithClient(<OrgInfluenceMap map={buildOrgInfluenceMap(GRAPH)!} />)
    expect(bare.textContent ?? '').not.toContain(tr('estimatedStock', { count: 0 }))
  })

  it('explore par rôle d’achat', async () => {
    const user = userEvent.setup()
    renderMap()
    await chooseOption(screen.getByLabelText(tr('filters.role')), 'technical_buyer')
    const canvas = screen.getByTestId('org-map-canvas').textContent ?? ''
    expect(canvas).toContain('Bruno Adtech')
    expect(canvas).not.toContain('Alice Directrice')
  })

  it('explore par confiance minimale — et garde les zones blanches visibles', async () => {
    const user = userEvent.setup()
    renderMap()
    await chooseOption(screen.getByLabelText(tr('filters.confidenceMin')), '90')
    const canvas = screen.getByTestId('org-map-canvas').textContent ?? ''
    expect(canvas).toContain('Alice Directrice')
    expect(canvas).not.toContain('Bruno Adtech')
    // Le trou reste : une carte filtrée ne doit pas se lire « tout est couvert ».
    expect(canvas).toContain(tr('toVerify'))
  })

  // #3850.4 — stockage E.164 compact, AFFICHAGE international lisible : même
  // fonction que `ContactKeyInfo`/`ContactTableRow`/`FocalOrgView`.
  it('#3850.4 — le téléphone du contact résolu s’affiche en international lisible, jamais le compact brut', () => {
    const contacts = [
      { id: 'c-alice', full_name: 'Alice Directrice', email: null, phone: '+33600000001' },
    ] as unknown as React.ComponentProps<typeof OrgInfluenceMap>['contacts']
    renderMap(contacts)
    expect(screen.getByText('+33 6 00 00 00 01')).toBeInTheDocument()
    expect(screen.queryByText('+33600000001')).toBeNull()
  })
})

describe('OrgInfluenceMap — la zone blanche déclenche la recherche', () => {
  it('propose « lancer une recherche ciblée » sur la case du trou', () => {
    const { container } = renderWithClient(<OrgInfluenceMap map={buildOrgInfluenceMap(GRAPH)!} accountId="a1" />)
    expect(container.textContent ?? '').toContain(tr('searchGap'))
  })

  it('sans compte porteur, aucun geste n’est proposé — un bouton mort vaut moins que rien', () => {
    const { container } = renderMap()
    expect(container.textContent ?? '').not.toContain(tr('searchGap'))
  })

  it('envoie les TITRES que la zone blanche affiche déjà, pas seulement son libellé de métier', async () => {
    // Le libellé de famille d'une zone blanche est une phrase (« Cloud /
    // Infrastructure / HPC »), pas une clé : envoyé seul, il partait tel quel en
    // titre Apollo et ne ramenait presque rien. Les titres sont sous les yeux du
    // commercial sur la carte — ce sont eux qu'il faut chercher.
    mockEnrichMutate.mockClear()
    const graph = orgGraphSchema.parse({
      ...GRAPH,
      uncoveredZones: [
        {
          entityId: 'e-pub',
          family: 'Cloud / Infrastructure / HPC',
          hierarchyLevel: 'L2',
          importance: 'critique',
          reason: 'Aucun décideur Cloud identifié',
          suggestedTitles: ['Head of Cloud', 'VP Cloud & Infrastructure'],
          suggestedQueries: [],
        },
      ],
    })
    const user = userEvent.setup()
    renderWithClient(<OrgInfluenceMap map={buildOrgInfluenceMap(graph)!} accountId="a1" />)

    await user.click(screen.getByRole('button', { name: new RegExp(tr('searchGap')) }))

    expect(mockEnrichMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        titles: ['Head of Cloud', 'VP Cloud & Infrastructure'],
        family: 'Cloud / Infrastructure / HPC',
        level: 'L2',
      }),
      expect.anything(),
    )
  })

  it('sans titre suggéré, la case reste cherchée par métier × niveau', async () => {
    // Une zone sans titres n'envoie pas une liste vide : la clé est OMISE, sinon
    // le serveur y lirait un ciblage explicite et n'appliquerait plus le preset
    // métier — la recherche se retrouverait sans aucun titre.
    mockEnrichMutate.mockClear()
    const graph = orgGraphSchema.parse({
      ...GRAPH,
      uncoveredZones: [
        {
          entityId: 'e-pub',
          family: 'Achats',
          hierarchyLevel: 'L5',
          importance: 'critique',
          reason: 'Aucun contact achats identifié',
          suggestedTitles: [],
          suggestedQueries: [],
        },
      ],
    })
    const user = userEvent.setup()
    renderWithClient(<OrgInfluenceMap map={buildOrgInfluenceMap(graph)!} accountId="a1" />)
    await user.click(screen.getByRole('button', { name: new RegExp(tr('searchGap')) }))

    const scope = mockEnrichMutate.mock.calls[0][0] as Record<string, unknown>
    expect(scope).not.toHaveProperty('titles')
    expect(scope.family).toBe('Achats')
    expect(scope.level).toBe('L5')
  })
})

describe('OrgInfluenceMap — filtre projet (p20)', () => {
  it('explore par projet (sujet d’influence)', async () => {
    const user = userEvent.setup()
    const withInfluence = orgGraphSchema.parse({
      ...GRAPH,
      influenceEdges: [
        {
          fromId: 'p-alice',
          toId: 'p-bruno',
          topic: 'Graph:ID',
          stance: 'supporter',
          confidence: 62,
          reasoning: 'sponsor du programme',
        },
      ],
    })
    renderWithClient(<OrgInfluenceMap map={buildOrgInfluenceMap(withInfluence)!} />)
    await chooseOption(screen.getByLabelText(tr('filters.project')), 'Graph:ID')
    const canvas = screen.getByTestId('org-map-canvas').textContent ?? ''
    expect(canvas).toContain('Alice Directrice')
    expect(canvas).toContain('Bruno Adtech')
    expect(canvas).not.toContain('Zoe Inconnue')
  })
})

/* ── Un lien dit d'où il vient ─────────────────────────────────────────────── */

/**
 * La règle : un rattachement SOURCÉ et une HYPOTHÈSE ne se ressemblent pas, et
 * le commercial sait lequel il regarde sans cliquer.
 *
 * Ce que l'écran faisait avant : un trait plein ou pointillé, `aria-hidden`, et
 * rien d'autre. Deux affirmations de nature opposée séparées par un motif de
 * bordure que personne n'annonce et qu'aucun lecteur d'écran ne rencontre.
 */
const SOURCED = orgGraphSchema.parse({
  graphVersion: 1,
  entities: [
    { id: 'e-groupe', name: 'Groupe TF1', type: 'groupe', parentId: null, confidence: 92, status: 'operating' },
    { id: 'e-dsi', name: 'DSI Groupe', type: 'bu', parentId: 'e-groupe', confidence: 85, status: 'operating' },
  ],
  people: [
    {
      id: 'p-cto',
      fullName: 'Bruno Cloud',
      title: 'CTO',
      entityId: 'e-dsi',
      hierarchyLevel: 'L2',
      decisionRoles: ['technical_buyer'],
      identityStatus: 'classified',
      confidence: 95,
      sources: [{ id: 's-orgchart', kind: 'org_chart', grounding: 'A', date: '2026-05-12' }],
    },
    {
      id: 'p-achat',
      fullName: 'Chloé Achats',
      title: 'Responsable achats IT',
      entityId: 'e-dsi',
      hierarchyLevel: 'L5',
      decisionRoles: ['procurement'],
      identityStatus: 'classified',
      confidence: 60,
    },
  ],
  hierarchyEdges: [
    // 91 : un score que ne porte AUCUN nœud, pour distinguer sans ambiguïté le
    // chiffre du LIEN de ceux des jauges de confiance des cartes.
    { fromId: 'p-cto', toId: 'e-dsi', type: 'member_of', sourceIds: ['s-orgchart'], confidence: 91, verified: true },
    { fromId: 'p-achat', toId: 'p-cto', type: 'reports_to', sourceIds: [], confidence: 55, verified: false },
  ],
  influenceEdges: [],
  buyingCommittee: [],
  uncoveredZones: [],
  recommendedPath: [],
  rejectedItems: [],
})

describe('OrgInfluenceMap — un lien dit d’où il vient', () => {
  it('ÉCRIT « rattachement sourcé » et cite la source datée du LIEN, sans clic', () => {
    const { container } = renderWithClient(<OrgInfluenceMap map={buildOrgInfluenceMap(SOURCED)!} />)
    const canvas = screen.getByTestId('org-map-canvas').textContent ?? ''
    expect(canvas).toContain(tr('link.sourced'))
    expect(canvas).toContain(i18n.t('accountOrg:orgGraph.sourceKinds.org_chart'))
    expect(canvas).toContain(formatDate('2026-05-12', { dateStyle: 'medium' }) as string)
    // …et la mention n'est pas cachée aux lecteurs d'écran par un aria-hidden.
    const mention = [...container.querySelectorAll('*')].find(el => el.textContent === tr('link.sourced'))
    expect(mention).toBeTruthy()
    expect(mention?.closest('[aria-hidden="true"]')).toBeNull()
  })

  it('DIT « hypothèse » sur un rattachement que le graphe ne prouve pas — et ne lui invente aucune provenance', () => {
    renderWithClient(<OrgInfluenceMap map={buildOrgInfluenceMap(SOURCED)!} />)
    const canvas = screen.getByTestId('org-map-canvas').textContent ?? ''
    // Chloé n'est rattachée que par `entityId` : aucun edge, aucune preuve.
    expect(canvas).toContain(tr('link.assumedUnsourced'))
  })

  it('nomme la ligne de reporting comme une hypothèse quand rien ne la source', () => {
    renderWithClient(<OrgInfluenceMap map={buildOrgInfluenceMap(SOURCED)!} />)
    const canvas = screen.getByTestId('org-map-canvas').textContent ?? ''
    expect(canvas).toContain(i18n.t('accountOrg:orgGraph.relations.reports_to'))
    expect(canvas).toContain(tr('link.assumedUnsourced'))
  })

  it('DIT QUAND le rattachement a été vérifié (#2121.37)', () => {
    // Une date RELATIVE : une date figée deviendrait périmée dans la CI de demain.
    const verifiedAt = new Date(Date.now() - 2 * 86_400_000).toISOString()
    const dated = orgGraphSchema.parse({
      ...SOURCED,
      hierarchyEdges: [
        SOURCED.hierarchyEdges[0],
        {
          fromId: 'p-achat',
          toId: 'p-cto',
          type: 'reports_to',
          sourceIds: ['s-orgchart'],
          confidence: 95,
          verified: true,
          lastVerifiedAt: verifiedAt,
        },
      ],
    })
    renderWithClient(<OrgInfluenceMap map={buildOrgInfluenceMap(dated)!} />)
    const canvas = screen.getByTestId('org-map-canvas').textContent ?? ''
    expect(canvas).toContain(tr('link.verifiedOn', { date: formatDate(verifiedAt, { dateStyle: 'medium' }) }))
  })

  it('un rattachement sans date de vérification le DIT — « jamais vérifié », pas un blanc (#2121.37)', () => {
    renderWithClient(<OrgInfluenceMap map={buildOrgInfluenceMap(SOURCED)!} />)
    const canvas = screen.getByTestId('org-map-canvas').textContent ?? ''
    expect(canvas).toContain(tr('link.neverVerified'))
  })

  it('ne dessine pas l’emplacement d’une zone blanche comme un rattachement établi', () => {
    // Le trait qui descend vers un trou de couverture était PLEIN : il se lisait
    // « ce poste est rattaché ici, c'est établi » alors que la case est vide.
    renderWithClient(<OrgInfluenceMap map={buildOrgInfluenceMap(GRAPH)!} />)
    const canvas = screen.getByTestId('org-map-canvas').textContent ?? ''
    expect(canvas).toContain(tr('link.gap'))
  })

  it('un lien PROUVÉ n’est pas accompagné d’un pourcentage — il est sourcé, pas probable', () => {
    // « Rattachement sourcé · 91 % » se lit « sûr à 91 % », c'est-à-dire une
    // probabilité. Le chiffre reste sur ce qui est deviné, où il dit quelque
    // chose ; il disparaît de ce qui est prouvé, où il ne dit rien.
    renderWithClient(<OrgInfluenceMap map={buildOrgInfluenceMap(SOURCED)!} />)
    const canvas = screen.getByTestId('org-map-canvas').textContent ?? ''
    expect(canvas).toContain(tr('link.sourced'))
    expect(canvas).not.toContain(tr('confidence', { value: 91 }))
    // …et il reste sur l'hypothèse, qui, elle, est un pari assumé.
    expect(canvas).toContain(tr('confidence', { value: 55 }))
  })

  it('la distinction ne tient pas au seul motif du trait : chaque état porte son MOT', () => {
    // Un pointillé disparaît en niveaux de gris photocopiés et n'existe pas pour
    // un lecteur d'écran. Les quatre états doivent être quatre textes différents.
    const labels = [tr('link.sourced'), tr('link.declared'), tr('link.assumedUnsourced'), tr('link.structure')]
    expect(new Set(labels).size).toBe(4)
    renderWithClient(<OrgInfluenceMap map={buildOrgInfluenceMap(SOURCED)!} />)
    const canvas = screen.getByTestId('org-map-canvas').textContent ?? ''
    for (const label of [tr('link.sourced'), tr('link.assumedUnsourced'), tr('link.structure')]) {
      expect(canvas).toContain(label)
    }
  })

  /**
   * #2121.35 — une DÉCLARATION TERRAIN (`OrgCorrectionDrawer`, source
   * `kind: 'workspace_user'`) est un TROISIÈME état, distinct de « sourcé »
   * (document tiers) et de « hypothèse » — jamais mélangé sous « vérifié ».
   */
  it('DIT « déclaré sur le terrain » quand la source est un commercial, pas un document tiers', () => {
    const declared = orgGraphSchema.parse({
      ...SOURCED,
      people: [
        SOURCED.people[0],
        {
          ...SOURCED.people[1],
          sources: [{ id: 's-terrain', kind: 'workspace_user', grounding: 'A', date: '2026-05-12' }],
        },
      ],
      hierarchyEdges: [
        SOURCED.hierarchyEdges[0],
        {
          fromId: 'p-achat',
          toId: 'p-cto',
          type: 'reports_to',
          sourceIds: ['s-terrain'],
          confidence: 100,
          verified: true,
        },
      ],
    })
    renderWithClient(<OrgInfluenceMap map={buildOrgInfluenceMap(declared)!} />)
    const canvas = screen.getByTestId('org-map-canvas').textContent ?? ''
    // La ligne de reporting de Chloé dit « déclaré », pas « sourcé » — le
    // membre_of de Bruno (autre lien, même graphe) reste, lui, « sourcé » :
    // les deux états coexistent sans se confondre.
    expect(canvas).toContain(tr('link.declared'))
    expect(canvas).toContain(tr('link.sourced'))
    // Une déclaration n'est pas une probabilité : pas de pourcentage à côté.
    expect(canvas).not.toContain(tr('confidence', { value: 100 }))
  })

  /**
   * #2121.32 / #2121.34 — « influences » et « works_with » se NOMMENT sur la
   * carte, avec le nom du vis-à-vis — sur les DEUX personnes qu'ils touchent,
   * jamais une seule.
   */
  it('nomme un lien « influences » et un lien « works_with », sur les deux personnes touchées', () => {
    const withCrossLinks = orgGraphSchema.parse({
      ...SOURCED,
      hierarchyEdges: [
        ...SOURCED.hierarchyEdges,
        { fromId: 'p-cto', toId: 'p-achat', type: 'works_with', sourceIds: [], confidence: 40, verified: false },
      ],
      influenceEdges: [
        {
          fromId: 'p-achat',
          toId: 'p-cto', // Chloé influence Bruno
          topic: 'Cloud 2026',
          stance: 'neutral',
          confidence: 55,
          reasoning: 'arbitre le budget cloud',
        },
      ],
    })
    renderWithClient(<OrgInfluenceMap map={buildOrgInfluenceMap(withCrossLinks)!} />)
    const canvas = screen.getByTestId('org-map-canvas').textContent ?? ''
    // Bruno Cloud (p-cto) est nommé chez Chloé (works_with + influencé PAR elle),
    // et Chloé Achats (p-achat) est nommée chez Bruno.
    const worksWith = i18n.t('accountOrg:orgGraph.relations.works_with')
    const influences = i18n.t('accountOrg:orgGraph.relations.influences')
    expect(canvas).toContain(`${worksWith} Bruno Cloud`)
    expect(canvas).toContain(`${worksWith} Chloé Achats`)
    expect(canvas).toContain(`${influences} Bruno Cloud`)
    expect(canvas).toContain(`${influences} Chloé Achats`)
  })
})

/* ── #2121.22-24, .27 — explorer une carte large ───────────────────────────── */

describe('OrgInfluenceMap — chercher, replier, mettre en avant, lire en liste (#2121.22 .23 .24 .27)', () => {
  // SOURCED + une troisième personne que AUCUN lien ne relie à Chloé.
  const WIDE = orgGraphSchema.parse({
    ...SOURCED,
    people: [
      ...SOURCED.people,
      {
        id: 'p-tiers',
        fullName: 'Denis Tiers',
        title: 'Chef de projet',
        entityId: 'e-dsi',
        hierarchyLevel: 'L3',
        decisionRoles: [],
        identityStatus: 'classified',
        confidence: 70,
      },
    ],
  })
  const renderWide = () => renderWithClient(<OrgInfluenceMap map={buildOrgInfluenceMap(WIDE)!} />)
  const canvasText = () => screen.getByTestId('org-map-canvas').textContent ?? ''

  it('retrouve une personne par son NOM, casse et accents ignorés (#2121.24)', async () => {
    const user = userEvent.setup()
    renderWide()
    await user.type(screen.getByLabelText(tr('search.label')), 'CHLOE')
    expect(canvasText()).toContain('Chloé Achats')
    expect(canvasText()).not.toContain('Bruno Cloud')
    expect(canvasText()).not.toContain('Denis Tiers')
  })

  it('replie une entité, DIT combien de personnes sont repliées, et la redéplie (#2121.22)', async () => {
    const user = userEvent.setup()
    renderWide()
    const collapse = screen.getByRole('button', { name: tr('collapse.collapse', { name: 'DSI Groupe' }) })
    expect(collapse).toHaveAttribute('aria-expanded', 'true')
    await user.click(collapse)
    expect(canvasText()).not.toContain('Bruno Cloud')
    expect(canvasText()).toContain(tr('collapse.hidden', { count: 3 }))
    await user.click(screen.getByRole('button', { name: tr('collapse.expand', { name: 'DSI Groupe' }) }))
    expect(canvasText()).toContain('Bruno Cloud')
  })

  it('met en avant les liens DIRECTS d’une personne et atténue le reste (#2121.23)', async () => {
    const user = userEvent.setup()
    renderWide()
    const card = (name: string) => screen.getByText(name).closest('[data-org-person]')
    const focus = screen.getByRole('button', { name: tr('focus.aria', { name: 'Chloé Achats' }) })
    await user.click(focus)
    expect(focus).toHaveAttribute('aria-pressed', 'true')
    expect(card('Chloé Achats')).toHaveAttribute('data-dimmed', 'false')
    // Son N+1 porte un lien direct : il reste en avant.
    expect(card('Bruno Cloud')).toHaveAttribute('data-dimmed', 'false')
    // Aucun lien ne relie Denis à Chloé : il s'efface — sans disparaître.
    expect(card('Denis Tiers')).toHaveAttribute('data-dimmed', 'true')
    await user.click(screen.getByRole('button', { name: tr('focus.clear') }))
    expect(card('Denis Tiers')).toHaveAttribute('data-dimmed', 'false')
  })

  it('bascule en LISTE — une ligne par personne, les mêmes filtres — et revient à la carte (#2121.27)', async () => {
    const user = userEvent.setup()
    renderWide()
    await user.click(screen.getByRole('button', { name: tr('display.list') }))
    const table = () => screen.getByRole('table', { name: tr('list.caption') })
    expect(within(table()).getAllByRole('row')).toHaveLength(4) // en-tête + 3 personnes
    await user.type(screen.getByLabelText(tr('search.label')), 'denis')
    expect(within(table()).getAllByRole('row')).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: tr('display.map') }))
    expect(screen.queryByRole('table', { name: tr('list.caption') })).toBeNull()
  })

  it('zoome, dézoome et réinitialise la carte ; le canevas défile pour se déplacer (#2121.21)', async () => {
    const user = userEvent.setup()
    renderMap()
    const canvas = screen.getByTestId('org-map-canvas')
    expect(canvas.className).toContain('overflow-auto')
    expect(screen.getByText(tr('zoom.level', { value: 100 }))).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: tr('zoom.in') }))
    expect(screen.getByText(tr('zoom.level', { value: 110 }))).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: tr('zoom.out') }))
    await user.click(screen.getByRole('button', { name: tr('zoom.out') }))
    expect(screen.getByText(tr('zoom.level', { value: 90 }))).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: tr('zoom.reset') }))
    expect(screen.getByText(tr('zoom.level', { value: 100 }))).toBeInTheDocument()
  })
})

/**
 * #2837 — Market Memory branché sur l'organigramme, mais SEULEMENT sur la
 * racine (l'ENTREPRISE analysée). `market_company_signal` est un agrégat par
 * ENTREPRISE, sans ventilation par famille/niveau de poste (épopée #2837) :
 * le poser sur une entité fille ou une zone blanche précise afficherait une
 * précision que la donnée n'a pas. La racine reste le seul nœud honnête.
 *
 * Mêmes quatre états, mêmes clés i18n que `AccountMarketMemoryCard`
 * (namespace `accounts`, `marketContext.*`) — « un objet, trois écrans » :
 * une quatrième surface qui recompterait ou reformulerait son propre texte
 * dirait la même chose autrement (GA-258).
 */
describe('OrgInfluenceMap — la mémoire marché reste un signal d’ENTREPRISE', () => {
  const trAccounts = (key: string, options?: Record<string, unknown>) =>
    i18n.t(`accounts:marketContext.${key}`, options ?? {})

  it('affiche le nombre de parcours observés sur la racine quand l’entreprise est couverte', () => {
    marketMemoryState.current = { data: { paths_observed: 12, esn_observed: 3 }, isPending: false, isError: false }
    renderWithClient(<OrgInfluenceMap map={buildOrgInfluenceMap(GRAPH)!} accountId="a1" />)
    expect(
      within(screen.getByTestId('org-entity-e-groupe')).getByText(trAccounts('paths', { count: 12 }), {
        exact: false,
      }),
    ).toBeInTheDocument()
  })

  it('écrit « Non mesuré », jamais 0, quand l’entreprise n’est pas couverte', () => {
    marketMemoryState.current = { data: null, isPending: false, isError: false }
    renderWithClient(<OrgInfluenceMap map={buildOrgInfluenceMap(GRAPH)!} accountId="a1" />)
    expect(
      within(screen.getByTestId('org-entity-e-groupe')).getByText(trAccounts('notMeasured'), { exact: false }),
    ).toBeInTheDocument()
  })

  it('dit la panne au lieu de se taire', () => {
    marketMemoryState.current = { data: undefined, isPending: false, isError: true }
    renderWithClient(<OrgInfluenceMap map={buildOrgInfluenceMap(GRAPH)!} accountId="a1" />)
    expect(
      within(screen.getByTestId('org-entity-e-groupe')).getByText(trAccounts('unavailable'), { exact: false }),
    ).toBeInTheDocument()
  })

  it('annonce la lecture en cours plutôt qu’un verdict prématuré', () => {
    marketMemoryState.current = { data: undefined, isPending: true, isError: false }
    renderWithClient(<OrgInfluenceMap map={buildOrgInfluenceMap(GRAPH)!} accountId="a1" />)
    expect(
      within(screen.getByTestId('org-entity-e-groupe')).getByText(trAccounts('loading'), { exact: false }),
    ).toBeInTheDocument()
  })

  it('ne pose rien sans compte porteur — la route ne part pas', () => {
    marketMemoryState.current = { data: { paths_observed: 12, esn_observed: 3 }, isPending: false, isError: false }
    renderWithClient(<OrgInfluenceMap map={buildOrgInfluenceMap(GRAPH)!} />)
    expect(screen.queryByText(trAccounts('title'), { exact: false })).toBeNull()
  })

  it('ne le pose JAMAIS sur une entité fille, même couverte', () => {
    marketMemoryState.current = { data: { paths_observed: 12, esn_observed: 3 }, isPending: false, isError: false }
    renderWithClient(<OrgInfluenceMap map={buildOrgInfluenceMap(GRAPH)!} accountId="a1" />)
    // TF1 Pub (e-pub) n'est pas la racine : sa carte ne porte pas la ligne.
    expect(within(screen.getByTestId('org-entity-e-pub')).queryByText(trAccounts('title'), { exact: false })).toBeNull()
  })
})

describe('OrgInfluenceMap — #4056.1 superposition CRM, en toutes lettres', () => {
  const crm = (id: string, full_name: string) => ({ id, full_name }) as unknown as Contact

  it('nomme connue / non retrouvée ; rien tant que les contacts ne sont pas chargés', () => {
    const { container } = renderMap([crm('c1', 'Alice Directrice')])
    expect(container.querySelector('[data-org-crm-match="known"]')).not.toBeNull()
    expect(container.querySelector('[data-org-crm-match="notFound"]')).not.toBeNull()
    expect(screen.getAllByText('Rattaché à ce compte').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Détectée, non retrouvée').length).toBeGreaterThan(0)
  })

  it('SAIT DIRE NON — contacts non chargés : aucun statut (pas de faux « non retrouvée »)', () => {
    const { container } = renderMap(undefined)
    expect(container.querySelector('[data-org-crm-match]')).toBeNull()
  })

  it('deux fiches pour le même nom ⇒ « Rapprochement incertain », sans fiche ouverte', () => {
    const { container } = renderMap([crm('c1', 'Directrice  Alice'), crm('c2', 'Directrice Alice')])
    expect(container.querySelector('[data-org-crm-match="uncertain"]')).not.toBeNull()
  })
})
