import type { Contact } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { TabOrganigramme } from './TabOrganigramme'

// #4116 (recette 13/10) — le bandeau de fraîcheur lit `useIsDemo` (hors démo seulement).
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => false }))

// Le garde de crédits lit la session : ce test monte l'onglet sans provider de
// session (il teste le RENDU, pas la facturation). On lui donne un solde connu
// et suffisant par défaut — #2502 exerce les deux autres états.
let canEnrich = true
let locked = false
vi.mock('@/features/credits/hooks/useCreditGate', () => ({
  useCreditGate: () => ({
    known: true,
    analysesLeft: 10,
    enrichmentsLeft: 10,
    canAnalyze: true,
    canEnrich,
    locked,
  }),
}))

// #3020 (retour bêta) — le bouton « Enrichir la carte » appelle
// `accountsApi.enrichOrganigram` (POST synchrone, voir
// `analysis-ondemand.service.ts`) ; on contrôle sa résolution pour observer
// l'avancement PENDANT l'appel, avant qu'il ne réponde.
const mockEnrichOrganigram = vi.fn()
vi.mock('@/features/accounts/api', async () => {
  const actual = await vi.importActual<typeof import('@/features/accounts/api')>('@/features/accounts/api')
  return {
    ...actual,
    accountsApi: { ...actual.accountsApi, enrichOrganigram: (...args: unknown[]) => mockEnrichOrganigram(...args) },
  }
})

// L'ancien `OrgChart` (et son besoin d'un vrai moteur de layout ReactFlow)
// est retiré (D280, 30/08) : les deux vides qui restent à sa place
// (`OrgMapEmptyState`) ne rendent que du texte et un bouton, rien à mocker
// ici — leur GESTE est testé dans `OrgMapEmptyState.test.tsx`.

// #2837 — `OrgInfluenceMap` lit la mémoire marché (`useAccountMarketContext`,
// donc `useSession`) pour sa carte d'influence. Même mock que
// `OrgInfluenceMap.test.tsx` : un état par défaut silencieux, ce fichier ne
// teste pas la mémoire marché.
vi.mock('@/features/accounts/hooks/useAccountMarketContext', () => ({
  useAccountMarketContext: () => ({ data: undefined, isPending: false, isError: false }),
}))

// #4072.1 — `FocalOrgView` lit les personnes déjà connues de l'espace (donc `useSession`) ; ce fichier
// ne teste pas ce marquage (voir `OrgKnownMarker.test.tsx`) : aucune personne connue.
vi.mock('@/features/account-facts/useKnownPeople', () => ({ useKnownPeople: () => null }))

const contact = (full_name: string, decision_role: string, priority: number): Contact =>
  ({
    id: full_name,
    account_id: 'a1',
    full_name,
    decision_role,
    priority,
    title: '',
    entity: 'EDF',
  }) as unknown as Contact

const EDF_CONTACTS = [
  contact('Vincent Niebel', 'operational', 5),
  contact('Patrick Charignon', 'economic', 4),
  contact('Olivier Ligneul', 'technical', 2),
  contact('Franck Michon', 'champion', 1),
]

// `raw_analysis.org` — the shape the API really returns (six filled blocks).
const EDF_ORG = {
  org: {
    organigramme: [
      {
        level: 'groupe',
        entity: 'EDF SA (Groupe holding)',
        contacts: ['Patrick Charignon'],
        missingRoles: ['CEO/Président', 'CFO', 'Directeur Général'],
      },
      {
        level: 'direction',
        entity: "DSIT (Direction des Systèmes d'Information et Télécoms)",
        contacts: ['François Raynaud', 'Olivier Ligneul'],
        missingRoles: ['Responsable Infrastructure Cloud', 'Responsable DevOps/SRE'],
      },
    ],
    // Shapes below follow the `bellum_organigramme` prompt schema.
    decisionChain: {
      description: "Processus d'achat centralisé.",
      steps: [{ step: '1. Identification du besoin', actors: ['Olivier Ligneul'], duration: '2 semaines' }],
      estimatedCycleLength: '6 mois',
      budgetAuthority: 'DSIT au-delà de 100 k€',
    },
    approach_order: [
      { step: 1, contact: 'Franck Michon', role: 'champion', why_first: 'Décideur opérationnel direct' },
    ],
    stakeholderMap: [{ fullName: 'Olivier Ligneul', stance: 'advocate', reasoning: 'Pilote la modernisation' }],
    uncoveredZones: [{ zone: 'Direction Achats', importance: 'critique' }],
  },
}

// Le même dossier, PLUS le graphe typé — ids personne au format de l'assembleur
// (`p-{slug(nom complet)}`), seule clé commune avec les contacts affichés.
const EDF_WITH_GRAPH = {
  org: {
    ...EDF_ORG.org,
    orgGraph: {
      graphVersion: 1,
      entities: [{ id: 'e1', name: 'EDF SA', type: 'groupe', confidence: 85 }],
      people: [
        {
          id: 'p-patrick-charignon',
          fullName: 'Patrick Charignon',
          entityId: 'e1',
          identityStatus: 'classified',
          confidence: 90,
        },
        {
          id: 'p-vincent-niebel',
          fullName: 'Vincent Niebel',
          entityId: 'e1',
          identityStatus: 'classified',
          confidence: 80,
        },
      ],
      hierarchyEdges: [
        {
          fromId: 'p-vincent-niebel',
          toId: 'p-patrick-charignon',
          type: 'reports_to',
          sourceIds: ['s1'],
          confidence: 95,
          verified: true,
        },
        {
          fromId: 'p-patrick-charignon',
          toId: 'e1',
          type: 'member_of',
          sourceIds: [],
          confidence: 60,
          verified: false,
        },
      ],
      influenceEdges: [],
      buyingCommittee: [],
      recommendedPath: [],
      rejectedItems: [],
    },
  },
}

// Le même graphe, mais SANS entité : des personnes classées existent, aucune
// filiale/BU à les rattacher. C'est le vide « noEntities » — l'analyse a
// tourné (le graphe existe), elle n'a rien trouvé à cartographier ici.
const EDF_GRAPH_NO_ENTITIES = {
  org: {
    ...EDF_ORG.org,
    orgGraph: {
      graphVersion: 1,
      entities: [],
      people: [
        {
          id: 'p-patrick-charignon',
          fullName: 'Patrick Charignon',
          entityId: null,
          identityStatus: 'classified',
          confidence: 90,
        },
      ],
      hierarchyEdges: [],
      influenceEdges: [],
      buyingCommittee: [],
      recommendedPath: [],
      rejectedItems: [],
    },
  },
}

function renderTab(rawAnalysis: Record<string, unknown>, contacts: Contact[] = EDF_CONTACTS) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <TabOrganigramme accountId="a1" contacts={contacts} rawAnalysis={rawAnalysis} />
    </QueryClientProvider>,
  )
}

/** Le bouton « Voir l'influence sur tout le groupe » vit dans la vue focale, plus à l'arrivée (23/10 : l'arbre arrive en tête). */
async function openFocalView() {
  await userEvent.click(screen.getByRole('tab', { name: i18n.t('accountOrg:orgViews.focal') }))
}

describe('TabOrganigramme', () => {
  beforeEach(async () => {
    canEnrich = true
    locked = false
    mockEnrichOrganigram.mockReset()
    await i18n.changeLanguage('fr')
  })

  /**
   * #2502 — DÉFAUT recette 17/09 (passage 7) : même geste que
   * `OrgMapEmptyState`, même mutation gratuite (`useEnrichOrganigram`,
   * `analysis-ondemand.service.ts:960-963` — aucun crédit débité), même bouton
   * qui se grisait à tort à zéro crédit dans l'entête persistante de l'onglet.
   */
  it('#2502 — le bouton « Enrichir la carte » de l’entête reste actif à zéro crédit (geste gratuit)', () => {
    canEnrich = false
    renderTab(EDF_WITH_GRAPH)
    expect(screen.getByRole('button', { name: i18n.t('accountOrg:organigramme.enrichCta') })).toBeEnabled()
  })

  it('#2502 — il se grise seulement quand l’accès est VERROUILLÉ (essai terminé)', () => {
    locked = true
    renderTab(EDF_WITH_GRAPH)
    const cta = screen.getByRole('button', { name: i18n.t('accountOrg:organigramme.enrichCta') })
    expect(cta).toBeDisabled()
    expect(cta).toHaveAttribute('title', i18n.t('accountOrg:organigramme.enrichLockedTitle'))
  })

  // Refonte Théo (23/10) — `sec:org` : la phrase de l'onglet, PUIS la barre des vues — sur un dossier avec graphe
  // comme sur un dossier sans (les deux chemins de rendu portent la même tête).
  it('Refonte Théo — la tête « sans inventer les liens » précède la barre des vues, avec ou sans graphe', () => {
    for (const fixture of [EDF_WITH_GRAPH, EDF_ORG]) {
      const { unmount } = renderTab(fixture)
      const head = screen.getByTestId('org-head')
      expect(head).toHaveTextContent(i18n.t('accountOrg:orgTheo.title'))
      expect(
        head.compareDocumentPosition(screen.getByTestId('org-toolbar')) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
      unmount()
    }
  })

  it('renders the org structure produced by the analysis under raw_analysis.org', () => {
    renderTab(EDF_ORG)
    expect(screen.getByText(/EDF SA \(Groupe holding\)/)).toBeInTheDocument()
    expect(screen.getByText(/DSIT \(Direction des Systèmes/)).toBeInTheDocument()
  })

  it('shows the uncovered roles as coverage gaps — never invents a name for them', () => {
    renderTab(EDF_ORG)
    expect(screen.getByText(/CEO\/Président/)).toBeInTheDocument()
    expect(screen.getByText(/Responsable DevOps\/SRE/)).toBeInTheDocument()
  })

  it('renders the tactical approach sequence with its rationale', () => {
    renderTab(EDF_ORG)
    // The name also appears in the recommended-path sidebar, hence getAllByText.
    expect(screen.getAllByText('Franck Michon').length).toBeGreaterThan(0)
    expect(screen.getByText(/Décideur opérationnel direct/)).toBeInTheDocument()
  })

  it('renders the buying process and its budget authority', () => {
    renderTab(EDF_ORG)
    expect(screen.getByText(/Identification du besoin/)).toBeInTheDocument()
    expect(screen.getByText(/DSIT au-delà de 100 k€/)).toBeInTheDocument()
  })

  it('renders each stakeholder with a readable stance label', () => {
    renderTab(EDF_ORG)
    expect(screen.getByText('Allié')).toBeInTheDocument()
    expect(screen.getByText(/Pilote la modernisation/)).toBeInTheDocument()
  })

  it('renders an honest empty state when the analysis produced no org block', () => {
    renderTab({}, [])
    expect(screen.getByText(i18n.t('accountOrg:structure.empty'))).toBeInTheDocument()
  })

  it('never renders a blank body — a crash reads as an outage, not as missing data', () => {
    const { container } = renderTab({})
    expect(container.textContent?.trim().length ?? 0).toBeGreaterThan(0)
  })

  it("exclut un ex-employé du périmètre de l'organigramme (annexe p15/p25)", () => {
    // Le compteur de la légende est le témoin du périmètre réellement passé à la
    // carte : l'ex-employé est classifié, donc s'il comptait il ferait 5/5.
    const exEmploye = { ...contact('Paul Parti', 'economic', 1), lifecycle_state: 'historique' } as Contact
    renderTab(EDF_ORG, [...EDF_CONTACTS, exEmploye])
    expect(screen.getByText('4/4 contacts classifiés')).toBeInTheDocument()
  })

  /**
   * Décision 3 du FINAL du 27/08 : la vue FOCALE est la page d'arrivée. La vue
   * Groupe reste accessible en un clic — le document refuse explicitement d'en
   * faire la home quotidienne (« trop large pour préparer une action »).
   */
  /**
   * ⚠️ TROUVÉ PAR LA RECETTE LIVE, PAS PAR UN TEST (31/08/2026, D890).
   *
   * Le planificateur d'enrichissement était monté dans `OrgStructureSection`,
   * APRÈS son `if (data.isEmpty) return …`. Or un dossier qui porte un
   * `orgGraph` MODERNE a justement une structure héritée VIDE — donc le
   * planificateur ne s'affichait sur AUCUN des comptes qui en ont besoin.
   * Livré, testé, mergé, déployé… et inatteignable : le défaut n°1 du dépôt,
   * au niveau du point d'entrée cette fois.
   *
   * Il vit désormais dans l'entête de l'onglet, à côté du geste
   * d'enrichissement dont il est la version ciblée.
   */
  it('le planificateur est atteignable sur un dossier à graphe MODERNE (structure héritée vide)', () => {
    renderTab(EDF_WITH_GRAPH)
    expect(screen.getByRole('button', { name: i18n.t('accountOrg:enrichmentPlanner.openCta') })).toBeInTheDocument()
  })

  it('Théo comptes-fiche — ouvre sur l’ARBRE (vue Hiérarchie, plein écran) dès que le dossier porte un graphe', () => {
    renderTab(EDF_WITH_GRAPH)
    expect(screen.getByTestId('org-tree')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: i18n.t('accountOrg:orgViews.hierarchy') })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByRole('group', { name: i18n.t('accountOrg:focal.treeAria') })).toBeInTheDocument()
    // Ni la carte système, ni un état vide : un seul dessin à la fois.
    expect(screen.queryByTestId('org-map-canvas')).not.toBeInTheDocument()
    expect(screen.queryByText(i18n.t('accountOrg:mapEmptyState.noGraphTitle'))).not.toBeInTheDocument()
    expect(screen.queryByText(i18n.t('accountOrg:mapEmptyState.noEntitiesTitle'))).not.toBeInTheDocument()
  })

  it('dessine la carte structurelle p20 en vue système, sans état vide', async () => {
    renderTab(EDF_WITH_GRAPH)
    await openFocalView()
    await userEvent.click(screen.getByRole('button', { name: i18n.t('accountOrg:focal.systemView') }))
    // La carte p20 est là…
    expect(screen.getByTestId('org-map-canvas')).toBeInTheDocument()
    expect(screen.getByText(i18n.t('accountOrg:orgMap.title'))).toBeInTheDocument()
    // …et aucun des deux états vides qu'elle remplace ne s'affiche en même temps.
    expect(screen.queryByText(i18n.t('accountOrg:mapEmptyState.noGraphTitle'))).not.toBeInTheDocument()
    expect(screen.queryByText(i18n.t('accountOrg:mapEmptyState.noEntitiesTitle'))).not.toBeInTheDocument()
  })

  it('la vue système se quitte comme elle s’ouvre — en un clic', async () => {
    renderTab(EDF_WITH_GRAPH)
    await openFocalView()
    await userEvent.click(screen.getByRole('button', { name: i18n.t('accountOrg:focal.systemView') }))
    // Le retour passe par le sélecteur de vue (31/08/2026), qui a remplacé le
    // bouton « revenir » : trois vues (#2121.2), un seul endroit d'où l'on commute.
    await userEvent.click(screen.getByRole('tab', { name: i18n.t('accountOrg:orgViews.focal') }))
    expect(screen.getByRole('group', { name: i18n.t('accountOrg:focal.treeAria') })).toBeInTheDocument()
  })

  /**
   * LES TROIS VUES DU SÉLECTEUR SONT ATTEIGNABLES, ET L'INFLUENCE RESTE LE
   * DÉFAUT (#2121.2, QCM Louis 15/09/2026).
   *
   * Le revirement du 31/08 avait rétabli cinq vues commutables ; celui du
   * 15/09 en retire deux DU SÉLECTEUR (édition, système) sans les supprimer —
   * leurs gestes vivent ailleurs (`ORG_VIEW_TABS`, orgViewModes.ts). Ce test
   * tient les deux moitiés de la décision : exactement trois onglets, et
   * celui qui est sélectionné à l'arrivée est « Influence ».
   */
  it('propose les trois vues Hiérarchie/Influence/Entités, et arrive sur la Hiérarchie (l’arbre)', async () => {
    renderTab(EDF_WITH_GRAPH)
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(3)
    expect(tabs.map(tab => tab.textContent)).toEqual([
      i18n.t('accountOrg:orgViews.hierarchy'),
      i18n.t('accountOrg:orgViews.focal'),
      i18n.t('accountOrg:orgViews.group'),
    ])
    expect(screen.getByRole('tab', { name: i18n.t('accountOrg:orgViews.hierarchy') })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    // « Édition » et « Système » ne sont plus DES ONGLETS.
    expect(screen.queryByRole('tab', { name: i18n.t('accountOrg:orgViews.edit') })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: i18n.t('accountOrg:orgViews.system') })).not.toBeInTheDocument()
    // Et une bascule change réellement l'écran, pas seulement l'onglet actif.
    await userEvent.click(screen.getByRole('tab', { name: i18n.t('accountOrg:orgViews.group') }))
    expect(screen.getByRole('group', { name: i18n.t('accountOrg:group.qualityTitle') })).toBeInTheDocument()
  })

  /**
   * ⚠️ Un dossier SANS graphe n'a rien à commuter : la barre n'existe pas.
   * Quatre onglets qui mènent tous au même vide seraient pires que pas d'onglet.
   */
  it('sans graphe, aucune barre de vues — il n’y a rien à commuter', () => {
    renderTab(EDF_ORG)
    expect(screen.queryAllByRole('tab')).toHaveLength(0)
  })

  /**
   * D280 (30/08) — l'ancien `OrgChart` est retiré, PAS remplacé par un blanc.
   * `EDF_ORG` n'a pas de `orgGraph` du tout, mais porte des contacts : le vide
   * NOMME qu'il manque un graphe, et pose le geste qui le construit.
   */
  it('affiche un état vide qui nomme le graphe manquant — pas l’ancien arbre plat', () => {
    renderTab(EDF_ORG)
    expect(screen.queryByTestId('org-map-canvas')).not.toBeInTheDocument()
    expect(screen.getByText(i18n.t('accountOrg:mapEmptyState.noGraphTitle'))).toBeInTheDocument()
    expect(screen.getByRole('button', { name: i18n.t('accountOrg:mapEmptyState.noGraphCta') })).toBeInTheDocument()
  })

  /**
   * Le MÊME vide « noGraph », mais sans aucun contact : chercher des contacts
   * est le premier geste possible — pas encore « enrichir la carte », qui n'a
   * rien à classer. Le vide n'est pas la même phrase que celui, plus bas, de
   * `OrgStructureSection` (`structure.empty`) : les deux coexistent, distincts.
   */
  it('sans aucun contact, propose de chercher des contacts, pas d’enrichir la carte', () => {
    renderTab({}, [])
    expect(screen.getByText(i18n.t('accountOrg:emptyState.title'))).toBeInTheDocument()
    expect(screen.getByRole('button', { name: i18n.t('accountOrg:emptyState.cta') })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: i18n.t('accountOrg:mapEmptyState.noGraphCta') }),
    ).not.toBeInTheDocument()
    // Le vide, plus bas, de la structure décisionnelle — une AUTRE phrase.
    expect(screen.getByText(i18n.t('accountOrg:structure.empty'))).toBeInTheDocument()
  })

  /**
   * La vue système, sur un graphe qui EXISTE et porte des personnes, mais
   * aucune entité. « L'analyse a tourné, elle n'a rien trouvé à cartographier
   * ici » — pas la même phrase que « pas encore d'organigramme ».
   */
  /**
   * Un graphe SANS entité n'a aucune direction (`listFocalDirections` filtre
   * sur les personnes DIRECTEMENT rattachées à une entité) : la vue focale
   * rend `null`, et son bouton « vue système » n'existe donc pas non plus —
   * ce cas ne s'atteint jamais en cliquant depuis un graphe qui en manque
   * dès le premier rendu. Il s'atteint quand la vue système est DÉJÀ ouverte
   * (un graphe qui avait des entités) et qu'une reconstruction en tâche de
   * fond (`useOrgRebuild`) la remplace par un graphe qui n'en a plus — l'état
   * React `systemView` survit au nouveau `rawAnalysis`, lui.
   */
  it('en vue système sur un graphe sans entité, nomme CE vide-là — pas celui du graphe absent', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { rerender } = render(
      <QueryClientProvider client={client}>
        <TabOrganigramme accountId="a1" contacts={EDF_CONTACTS} rawAnalysis={EDF_WITH_GRAPH} />
      </QueryClientProvider>,
    )
    await openFocalView()
    await userEvent.click(screen.getByRole('button', { name: i18n.t('accountOrg:focal.systemView') }))
    expect(screen.getByTestId('org-map-canvas')).toBeInTheDocument()

    rerender(
      <QueryClientProvider client={client}>
        <TabOrganigramme accountId="a1" contacts={EDF_CONTACTS} rawAnalysis={EDF_GRAPH_NO_ENTITIES} />
      </QueryClientProvider>,
    )
    expect(screen.getByText(i18n.t('accountOrg:mapEmptyState.noEntitiesTitle'))).toBeInTheDocument()
    expect(screen.queryByText(i18n.t('accountOrg:mapEmptyState.noGraphTitle'))).not.toBeInTheDocument()
    expect(screen.queryByTestId('org-map-canvas')).not.toBeInTheDocument()
  })

  it('montre les 4 vues sourcées AVANT la structure héritée qu’elles remplacent', async () => {
    const { container } = renderTab(EDF_WITH_GRAPH)
    await openFocalView()
    await userEvent.click(screen.getByRole('button', { name: i18n.t('accountOrg:focal.systemView') }))
    const body = container.textContent ?? ''
    expect(body.indexOf(i18n.t('accountOrg:orgGraph.title'))).toBeGreaterThan(-1)
    expect(body.indexOf(i18n.t('accountOrg:orgGraph.title'))).toBeLessThan(body.indexOf('EDF SA (Groupe holding)'))
  })
})

/**
 * #3020 (retour bêta) — « on ne voit pas l'avancée, on a juste l'impression
 * que ça charge dans le vide ». L'appel `enrich-organigram` est SYNCHRONE
 * côté serveur (une classification IA, aucun job en file) : rien à sonder.
 * Ce que l'écran peut montrer honnêtement, c'est ce qu'il MESURE déjà —
 * le nombre réel de contacts engagés, et le temps réellement écoulé.
 */
describe('TabOrganigramme — avancement réel de l’enrichissement (#3020)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('affiche le compte RÉEL de contacts et le temps écoulé, pas un texte figé', async () => {
    let resolveEnrich: (value: { matched: number; total: number; orgGraphUpdated: boolean }) => void = () => {}
    mockEnrichOrganigram.mockReturnValue(
      new Promise(resolve => {
        resolveEnrich = resolve
      }),
    )
    renderTab(EDF_WITH_GRAPH)
    fireEvent.click(screen.getByRole('button', { name: i18n.t('accountOrg:organigramme.enrichCta') }))
    // `mutate()` bascule `isPending` via une micro-tâche : on la laisse passer
    // avant de lire l'écran (pas de `findBy*` ici — son sondage suppose des
    // horloges réelles, et cette suite tourne sous horloge FIGÉE).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    // Immédiatement après : zéro seconde écoulée, mais déjà le compte réel de contacts.
    expect(
      screen.getByText(i18n.t('accountOrg:organigramme.enrichingProgress', { count: EDF_CONTACTS.length, elapsed: 0 })),
    ).toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000)
    })
    expect(
      screen.getByText(i18n.t('accountOrg:organigramme.enrichingProgress', { count: EDF_CONTACTS.length, elapsed: 3 })),
    ).toBeInTheDocument()

    await act(async () => {
      resolveEnrich({ matched: 4, total: 4, orgGraphUpdated: true })
      await vi.advanceTimersByTimeAsync(0)
    })
    // Un état final clair : le bouton reprend son libellé normal, la
    // progression ne reste pas affichée sur un appel terminé.
    expect(screen.getByRole('button', { name: i18n.t('accountOrg:organigramme.enrichCta') })).toBeInTheDocument()
    expect(screen.queryByText(/…/)).toBeNull()
  })
})
