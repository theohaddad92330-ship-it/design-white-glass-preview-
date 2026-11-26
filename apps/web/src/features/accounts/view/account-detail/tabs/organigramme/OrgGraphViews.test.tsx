import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { apiFetch } from '@/lib/api'
import { formatDate } from '@/lib/locale'
import { buildOrgGraphViewData } from './orgGraphData'
import { OrgGraphViews } from './OrgGraphViews'

/**
 * Ce que le dossier PORTE doit se voir, et ce que l'utilisateur SAIT doit
 * pouvoir remonter. Deux garanties tenues ici :
 *
 * 1. la matière du prompt refondu (sujet + posture + raisonnement d'une
 *    influence, canal + repli d'une étape) atteint l'écran — et un champ absent
 *    n'invente rien ;
 * 2. le geste « ce contact n'est plus là » existe là où le contact est vu, et
 *    parle à la surface de feedback existante avec la cible `contact` — la
 *    seule que le versionnement du graphe sait traduire en rejet.
 */

const GRAPH = {
  graphVersion: 3,
  entities: [{ id: 'e1', name: 'TF1 Groupe', type: 'groupe', confidence: 85 }],
  people: [
    {
      id: 'p-claire-basset',
      fullName: 'Claire Basset',
      title: 'Directrice Data',
      entityId: 'e1',
      identityStatus: 'actionable',
      confidence: 88,
      sources: [
        {
          id: 's-claire-official',
          kind: 'official_site',
          grounding: 'A',
          ref: 'https://tf1.fr/gouvernance',
          date: '2026-04-02',
        },
      ],
    },
    {
      id: 'p-marc-oliveira',
      fullName: 'Marc Oliveira',
      title: 'DSI',
      entityId: 'e1',
      identityStatus: 'actionable',
      confidence: 84,
      sources: [{ id: 's-marc-linkedin', kind: 'linkedin', grounding: 'B' }],
    },
  ],
  hierarchyEdges: [
    // Un lien vérifié qui cite sa source (site officiel), et un lien probable.
    {
      fromId: 'p-marc-oliveira',
      toId: 'p-claire-basset',
      type: 'reports_to',
      sourceIds: ['s-claire-official'],
      confidence: 95,
      verified: true,
    },
    {
      fromId: 'p-claire-basset',
      toId: 'e1',
      type: 'member_of',
      sourceIds: ['s-marc-linkedin'],
      confidence: 78,
      verified: false,
    },
  ],
  influenceEdges: [
    {
      fromId: 'p-claire-basset',
      toId: 'p-marc-oliveira',
      topic: 'sponsoring de programme',
      stance: 'supporter',
      confidence: 62,
      reasoning: 'Cite le programme Graph:ID comme sa priorité 2026 en conférence.',
      // Provenance connue (D405) : elle référence la source déjà portée par Claire.
      sourceIds: ['s-claire-official'],
      derivedAt: '2026-08-20T09:00:00.000Z',
    },
    {
      fromId: 'p-marc-oliveira',
      toId: 'p-claire-basset',
      topic: 'autorité budgétaire',
      confidence: 41,
      reasoning: 'Arbitre les enveloppes SI, sans position publique connue sur le sujet.',
      // Aucune provenance connue : ni sourceIds ni derivedAt (D405).
    },
  ],
  buyingCommittee: [{ personId: 'p-claire-basset', role: 'champion', entityId: 'e1', reason: 'Porte le besoin data.' }],
  uncoveredZones: [],
  recommendedPath: [
    {
      step: 1,
      personId: 'p-claire-basset',
      objective: 'Faire qualifier le besoin data.',
      channel: 'LinkedIn puis appel',
      unlocks: 'Accès au DSI',
      fallback: 'Passer par le responsable achats si pas de réponse sous 10 jours.',
    },
    { step: 2, personId: 'p-marc-oliveira', objective: 'Valider le cadre budgétaire.' },
  ],
  rejectedItems: [],
}

function renderViews(graph: Record<string, unknown> = GRAPH) {
  const data = buildOrgGraphViewData({ org: { orgGraph: graph } })
  if (!data) throw new Error('fixture invalide : le graphe doit passer le contrat')
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <OrgGraphViews data={data} accountId="a1" />
    </QueryClientProvider>,
  )
}

const openView = (key: 'influence' | 'committee' | 'path' | 'teams' | 'workspaceRelations') =>
  fireEvent.click(screen.getByText(i18n.t(`accountOrg:orgGraph.views.${key}`)))

describe('OrgGraphViews — carte d’influence', () => {
  beforeEach(() => vi.mocked(apiFetch).mockClear())

  it('nomme le sujet, le sens et la raison de chaque influence', () => {
    const { container } = renderViews()
    openView('influence')
    const body = container.textContent ?? ''
    expect(body).toContain('sponsoring de programme')
    expect(body).toContain(i18n.t('accountOrg:orgGraph.weighsOn'))
    expect(body).toContain(i18n.t('accountOrg:orgGraph.stances.supporter'))
    expect(body).toContain('Cite le programme Graph:ID comme sa priorité 2026 en conférence.')
    // La fonction, quand le graphe la porte, situe qui pèse sur qui.
    expect(body).toContain('Directrice Data')
  })

  it('une posture absente reste inconnue — jamais « neutre » par défaut', () => {
    const { container } = renderViews()
    openView('influence')
    const body = container.textContent ?? ''
    expect(body).toContain(i18n.t('accountOrg:orgGraph.stances.unknown'))
    expect(body).not.toContain(i18n.t('accountOrg:orgGraph.stances.neutral'))
  })

  it('cite la source de l’influence quand le graphe la porte (D405)', () => {
    const { container } = renderViews()
    openView('influence')
    const body = container.textContent ?? ''
    // sourceIds: ['s-claire-official'] résout sur la source « site officiel »
    // déjà portée par Claire — exactement le mécanisme des arêtes hiérarchiques.
    expect(body).toContain(i18n.t('accountOrg:orgGraph.sourceKinds.official_site'))
    expect(body).toContain(formatDate('2026-04-02', { dateStyle: 'medium' }) as string)
  })

  it('dit « source inconnue » quand l’influence n’a aucune provenance résolue', () => {
    const { container } = renderViews()
    openView('influence')
    const body = container.textContent ?? ''
    // L'arête « autorité budgétaire » n'a ni sourceIds ni derivedAt : elle ne
    // se présente pas comme sourcée, elle le DIT.
    expect(body).toContain(i18n.t('accountOrg:orgGraph.sourceUnknown'))
  })
})

describe('OrgGraphViews — organigramme vérifié', () => {
  beforeEach(() => vi.mocked(apiFetch).mockClear())

  it('cite la source du lien vérifié (annexe p5)', () => {
    const { container } = renderViews()
    const body = container.textContent ?? ''
    // Le site officiel qui établit le lien vérifié est nommé, avec sa date.
    expect(body).toContain(i18n.t('accountOrg:orgGraph.sourceKinds.official_site'))
    expect(body).toContain(formatDate('2026-04-02', { dateStyle: 'medium' }) as string)
  })

  it('distingue « probable » d’« hypothèse » par le MOT, pas la seule teinte (p14)', () => {
    const { container } = renderViews()
    const body = container.textContent ?? ''
    expect(body).toContain(i18n.t('accountOrg:orgGraph.tiers.verified'))
    expect(body).toContain(i18n.t('accountOrg:orgGraph.tiers.probable'))
  })

  it('n’affiche « hypothèse » que sous 70', () => {
    const weak = {
      ...GRAPH,
      hierarchyEdges: [
        { fromId: 'p-claire-basset', toId: 'e1', type: 'member_of', sourceIds: [], confidence: 55, verified: false },
      ],
    }
    const { container } = renderViews(weak)
    expect(container.textContent ?? '').toContain(i18n.t('accountOrg:orgGraph.tiers.hypothesis'))
  })
})

describe('OrgGraphViews — chemin recommandé', () => {
  beforeEach(() => vi.mocked(apiFetch).mockClear())

  it('montre le canal et le repli quand l’étape les porte', () => {
    const { container } = renderViews()
    openView('path')
    const body = container.textContent ?? ''
    expect(body).toContain('LinkedIn puis appel')
    expect(body).toContain(i18n.t('accountOrg:orgGraph.fallback'))
    expect(body).toContain('Passer par le responsable achats si pas de réponse sous 10 jours.')
  })

  it('n’affiche ni canal ni repli quand le dossier n’en porte pas', () => {
    const bare = {
      ...GRAPH,
      recommendedPath: [{ step: 1, personId: 'p-marc-oliveira', objective: 'Valider le cadre budgétaire.' }],
    }
    const { container } = renderViews(bare)
    openView('path')
    const body = container.textContent ?? ''
    expect(body).toContain('Valider le cadre budgétaire.')
    expect(body).not.toContain(i18n.t('accountOrg:orgGraph.fallback'))
  })
})

describe('OrgGraphViews — écarter un contact', () => {
  beforeEach(() => vi.mocked(apiFetch).mockClear())

  it('remonte « n’est plus en poste » sur la cible contact, avec le nom complet', async () => {
    const u = userEvent.setup({ pointerEventsCheck: 0 })
    renderViews()
    openView('committee')
    await u.click(screen.getAllByTestId('org-contact-dismiss')[0]!)
    await u.click(await screen.findByText(i18n.t('accountOrg:orgGraph.dismiss.gone')))

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1))
    expect(vi.mocked(apiFetch).mock.calls[0]?.[0]).toMatchObject({
      path: '/accounts/a1/feedback',
      method: 'POST',
      body: { target: 'contact', targetRef: 'Claire Basset', verdict: 'obsolete' },
    })
  })

  it('propose aussi le geste sur chaque étape du chemin', () => {
    renderViews()
    openView('path')
    expect(screen.getAllByTestId('org-contact-dismiss')).toHaveLength(2)
  })
})

/**
 * DoD p32 : « chaque nœud et edge porte source, date, statut et confiance », et
 * « chaque correction user produit une nouvelle graph_version ». Ces axes
 * vivaient déjà dans le contrat sans jamais atteindre l'écran.
 */
describe('OrgGraphViews — ce que le graphe porte doit se voir', () => {
  beforeEach(() => vi.mocked(apiFetch).mockClear())

  it('affiche la version du graphe et ce qu’il contient', () => {
    const { container } = renderViews()
    const body = container.textContent ?? ''
    expect(body).toContain(i18n.t('accountOrg:orgGraph.meta.version', { value: 3 }))
    expect(body).toContain(
      i18n.t('accountOrg:orgGraph.meta.counts', { entities: 1, people: 2, verified: 1, inferred: 1 }),
    )
  })

  it('liste les contacts écartés et leur raison — la preuve que la correction a tenu', async () => {
    const u = userEvent.setup({ pointerEventsCheck: 0 })
    // Un écarté n'est PLUS dans le graphe (invariant du contrat) : il ne reste
    // que sa trace dans `rejectedItems`, et c'est elle qu'on doit savoir lire.
    const { container } = renderViews({
      ...GRAPH,
      people: GRAPH.people.filter(p => p.id !== 'p-marc-oliveira'),
      hierarchyEdges: [],
      influenceEdges: [],
      recommendedPath: GRAPH.recommendedPath.filter(s => s.personId !== 'p-marc-oliveira'),
      rejectedItems: [{ sourceId: 'p-marc-oliveira', reason: 'Signalé comme parti par le commercial' }],
    })
    await u.click(screen.getByText(i18n.t('accountOrg:orgGraph.meta.rejected', { count: 1 })))
    const body = container.textContent ?? ''
    expect(body).toContain('Marc Oliveira')
    expect(body).toContain('Signalé comme parti par le commercial')
  })

  // #2284.14 — un homonyme écarté se NOMME homonyme, dans la langue de l'écran.
  it('un écarté qualifié se dit par son kind — « Homonyme », pas une raison figée', async () => {
    const u = userEvent.setup({ pointerEventsCheck: 0 })
    await i18n.changeLanguage('en')
    const { container } = renderViews({
      ...GRAPH,
      rejectedItems: [
        { sourceId: 'e-thales-boulangerie', reason: 'entité écartée (homonyme)', entityKind: 'homonym' },
        { sourceId: 'p-temoin', reason: 'Signalé comme parti' },
      ],
    })
    await u.click(screen.getByText(i18n.t('accountOrg:orgGraph.meta.rejected', { count: 2 })))
    const body = container.textContent ?? ''
    expect(body).toContain(i18n.t('accountDetail:overview.entityResolution.kind.homonym'))
    expect(body).not.toContain('entité écartée (homonyme)')
    // Le témoin sans kind garde sa raison.
    expect(body).toContain('Signalé comme parti')
    await i18n.changeLanguage('fr')
  })

  it('sans rejet, aucun dépliant à ouvrir', () => {
    const { container } = renderViews()
    expect(container.textContent ?? '').not.toContain(i18n.t('accountOrg:orgGraph.meta.rejected', { count: 1 }))
  })

  it('porte sur un siège du comité son niveau, son métier, son rôle, son statut et son accès', () => {
    const { container } = renderViews({
      ...GRAPH,
      people: [
        {
          id: 'p-claire-basset',
          fullName: 'Claire Basset',
          title: 'Directrice Data',
          entityId: 'e1',
          hierarchyLevel: 'L2',
          family: 'Data / Adtech',
          decisionRoles: ['champion', 'unknown'],
          identityStatus: 'actionable',
          confidence: 88,
          sources: [{ id: 's-claire-official', kind: 'official_site', grounding: 'A', date: '2026-04-02' }],
        },
      ],
      hierarchyEdges: [],
      influenceEdges: [],
      recommendedPath: [],
      buyingCommittee: [
        {
          personId: 'p-claire-basset',
          role: 'champion',
          entityId: 'e1',
          reason: 'Porte le besoin data.',
          accessScore: 82,
        },
      ],
    })
    openView('committee')
    const body = container.textContent ?? ''
    expect(body).toContain(i18n.t('accountOrg:orgMap.levels.L2'))
    expect(body).toContain('Data / Adtech')
    expect(body).toContain(i18n.t('accountOrg:orgMap.identityStatus.actionable'))
    expect(body).toContain(i18n.t('accountOrg:orgGraph.access', { value: 82 }))
    // La source datée de la personne, pas seulement celle des liens.
    expect(body).toContain(formatDate('2026-04-02', { dateStyle: 'medium' }) as string)
    // « unknown » n'est pas un rôle : il n'est pas affiché comme tel.
    expect(body).not.toContain(i18n.t('accountOrg:orgGraph.roles.unknown'))
  })
})

describe('OrgGraphViews — vérifier une relation (p22)', () => {
  beforeEach(() => vi.mocked(apiFetch).mockClear())

  /** Le même graphe, PLUS un rattachement inféré entre deux personnes — la seule
   *  forme de lien que le vérificateur sache traiter. */
  const GRAPH_WITH_PERSON_LINK = {
    ...GRAPH,
    hierarchyEdges: [
      ...GRAPH.hierarchyEdges,
      {
        fromId: 'p-claire-basset',
        toId: 'p-marc-oliveira',
        type: 'reports_to',
        sourceIds: ['s-marc-linkedin'],
        confidence: 62,
        verified: false,
      },
    ],
  }

  it('propose la vérification sur un lien INFÉRÉ entre deux PERSONNES', () => {
    const { container } = renderViews(GRAPH_WITH_PERSON_LINK)
    const label = i18n.t('accountOrg:orgGraph.verifyRelation')
    // 1 lien vérifié + 1 `member_of` vers une entité + 1 rattachement inféré
    // entre deux personnes → un seul bouton, et c'est le dernier.
    expect(screen.getAllByText(label)).toHaveLength(1)
    expect(container.textContent).toContain(label)
  })

  it('ne le propose PAS sur un lien dont la cible est une ENTITÉ (D362)', () => {
    // Mesuré le 30/08 : les liens hiérarchiques réellement produits par
    // l'assembleur sont TOUS des `member_of`, et 4 sur 4 pointent vers une
    // entité. Le vérificateur cherche deux NOMS DE PERSONNES sur une même page
    // et `relationToVerify` refuse toute extrémité non nommée : le clic ne
    // pouvait rendre qu'un 412. Un bouton qui ne peut qu'échouer coûte plus
    // cher qu'un bouton absent — il fait croire qu'une preuve est atteignable.
    const { container } = renderViews()
    const label = i18n.t('accountOrg:orgGraph.verifyRelation')
    expect(screen.queryAllByText(label)).toHaveLength(0)
    expect(container.textContent).not.toContain(label)
  })

  it('#4463 — n’écrit AUCUN coût à côté du bouton, ni dans l’infobulle', () => {
    const { container } = renderViews(GRAPH_WITH_PERSON_LINK)
    expect(container.textContent).not.toMatch(/cr[ée]dit/i)
    expect(i18n.t('accountOrg:orgGraph.verifyRelationHint')).not.toMatch(/cr[ée]dit/i)
    expect(i18n.t('accountOrg:orgGraph.verifyRelationHint', { lng: 'en' })).not.toMatch(/credit/i)
  })

  it('envoie LE lien visé au serveur — deux extrémités et son type', async () => {
    const u = userEvent.setup({ pointerEventsCheck: 0 })
    renderViews(GRAPH_WITH_PERSON_LINK)
    await u.click(screen.getByText(i18n.t('accountOrg:orgGraph.verifyRelation')))

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1))
    expect(vi.mocked(apiFetch).mock.calls[0]?.[0]).toMatchObject({
      path: '/analysis/a1/verify-relation',
      method: 'POST',
      body: { fromId: 'p-claire-basset', toId: 'p-marc-oliveira', type: 'reports_to' },
    })
  })
})

describe('OrgGraphViews — score de confiance du graphe (p19/p30)', () => {
  beforeEach(() => vi.mocked(apiFetch).mockClear())

  it('affiche la confiance globale, dérivée des nœuds', () => {
    // people p-claire (88) + p-marc (84) → moyenne 86.
    const { container } = renderViews()
    expect(container.textContent).toContain(i18n.t('accountOrg:orgGraph.meta.confidence', { value: 86 }))
  })
})

// #2919/#2310.2/.13-.21/.37/.40 — les deux vues neuves. Le graphe de base
// (GRAPH) ne porte ni équipe ni edge relationnel : elles doivent s'annoncer
// vides, jamais silencieuses (doctrine « on n'affiche pas ce qu'on n'a pas »
// — ici l'affichage EST l'annonce du vide, comme les quatre vues existantes).
describe('OrgGraphViews — vue « Équipes » (#2310.2/.37)', () => {
  beforeEach(() => vi.mocked(apiFetch).mockClear())

  it('dit son vide quand le graphe ne porte aucune équipe', () => {
    const { container } = renderViews()
    openView('teams')
    expect(container.textContent).toContain(i18n.t('accountOrg:orgGraph.emptyTeams'))
  })

  it('liste une équipe et les personnes qui s’y rattachent', () => {
    const graphWithTeam = {
      ...GRAPH,
      entities: [...GRAPH.entities, { id: 'e-squad', name: 'Squad Data', type: 'equipe', confidence: 70 }],
      people: GRAPH.people.map(p => (p.id === 'p-claire-basset' ? { ...p, entityId: 'e-squad' } : p)),
    }
    const { container } = renderViews(graphWithTeam)
    openView('teams')
    const body = container.textContent ?? ''
    expect(body).toContain('Squad Data')
    expect(body).toContain('Claire Basset')
    // Marc n'est pas rattaché à l'équipe : il n'apparaît pas dans sa liste.
    expect(screen.queryByText('Squad Data')?.closest('li')?.textContent).not.toContain('Marc Oliveira')
  })
})

describe('OrgGraphViews — vue « Relations workspace » (#2310.13-.21/.27/.28/.40)', () => {
  beforeEach(() => vi.mocked(apiFetch).mockClear())

  it('dit son vide quand le graphe ne porte aucun edge relationnel', () => {
    const { container } = renderViews()
    openView('workspaceRelations')
    expect(container.textContent).toContain(i18n.t('accountOrg:orgGraph.emptyWorkspaceRelations'))
  })

  it('nomme la nature, le scope et l’auteur de chaque relation', () => {
    const graphWithRelation = {
      ...GRAPH,
      relationalEdges: [
        {
          fromId: 'p-claire-basset',
          toId: 'p-marc-oliveira',
          type: 'owns_project',
          scope: 'workspace',
          author: 'Louis',
          sourceIds: [],
          confidence: 55,
        },
      ],
    }
    const { container } = renderViews(graphWithRelation)
    openView('workspaceRelations')
    const body = container.textContent ?? ''
    expect(body).toContain(i18n.t('accountOrg:orgGraph.relationalTypes.owns_project'))
    expect(body).toContain(i18n.t('accountOrg:orgGraph.relationalScope.workspace'))
    expect(body).toContain(i18n.t('accountOrg:orgGraph.relationalAuthor', { author: 'Louis' }))
  })
})
