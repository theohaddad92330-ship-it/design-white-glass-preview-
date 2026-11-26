import { orgLinkOrigin as contractLinkOrigin, orgGraphSchema, type OrgGraph } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { buildOrgInfluenceMap, filterOrgInfluenceMap, orgLinkOrigin } from './orgInfluenceMapData'

/** Un graphe TF1-like : groupe → 2 BU, des personnes rattachées, une zone blanche. */
function tf1(overrides: Record<string, unknown> = {}): OrgGraph {
  return orgGraphSchema.parse({
    graphVersion: 1,
    entities: [
      { id: 'e-groupe', name: 'Groupe TF1', type: 'groupe', parentId: null, confidence: 92, status: 'operating' },
      { id: 'e-pub', name: 'TF1 Pub', type: 'filiale', parentId: 'e-groupe', confidence: 80, status: 'operating' },
      { id: 'e-dsi', name: 'DSI Groupe', type: 'bu', parentId: 'e-groupe', confidence: 80, status: 'operating' },
    ],
    people: [
      {
        id: 'p-dg',
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
        id: 'p-cto',
        fullName: 'Bruno Cloud',
        title: 'CTO',
        entityId: 'e-dsi',
        hierarchyLevel: 'L2',
        family: 'IT / Cloud',
        decisionRoles: ['technical_buyer'],
        identityStatus: 'classified',
        confidence: 73,
      },
      {
        id: 'p-achat',
        fullName: 'Chloé Achats',
        title: 'Responsable achats IT',
        entityId: 'e-dsi',
        hierarchyLevel: 'L5',
        family: 'Achats',
        decisionRoles: ['procurement'],
        identityStatus: 'classified',
        confidence: 65,
      },
      {
        id: 'p-orphelin',
        fullName: 'David Sans Entite',
        identityStatus: 'verified_identity',
        decisionRoles: [],
        confidence: 50,
      },
    ],
    hierarchyEdges: [
      {
        fromId: 'p-cto',
        toId: 'e-dsi',
        type: 'member_of',
        sourceIds: ['s-p-cto-linkedin'],
        confidence: 60,
        verified: false,
      },
      {
        fromId: 'p-achat',
        toId: 'p-cto',
        type: 'reports_to',
        sourceIds: ['s-p-achat-linkedin'],
        confidence: 70,
        verified: false,
      },
    ],
    influenceEdges: [],
    buyingCommittee: [],
    uncoveredZones: [
      {
        entityId: 'e-pub',
        family: 'Data / Adtech',
        hierarchyLevel: 'L2',
        importance: 'critique',
        reason: 'Aucun contact Data chez TF1 Pub',
        suggestedTitles: ['Head of Data'],
        suggestedQueries: [],
      },
      // Zone SANS entité : elle n'a pas de place dans la carte, on ne lui en invente pas.
      { importance: 'importante', reason: 'Finance non couverte', suggestedTitles: [], suggestedQueries: [] },
    ],
    recommendedPath: [],
    rejectedItems: [],
    ...overrides,
  })
}

describe('buildOrgInfluenceMap', () => {
  it('renvoie null quand le graphe ne porte aucune entité (aucune structure à dessiner)', () => {
    const flat = tf1({
      entities: [],
      people: [{ id: 'p-x', fullName: 'X', identityStatus: 'classified', confidence: 50 }],
      hierarchyEdges: [],
      uncoveredZones: [],
    })
    expect(buildOrgInfluenceMap(flat)).toBeNull()
  })

  it('place la racine du groupe au sommet et les entités filles en rangée 2', () => {
    const map = buildOrgInfluenceMap(tf1())!
    expect(map.roots.map(r => r.id)).toEqual(['e-groupe'])
    expect(map.columns.filter(c => c.entity && c.entity.id !== 'e-groupe').map(c => c.entity!.name)).toEqual([
      'TF1 Pub',
      'DSI Groupe',
    ])
  })

  it('rattache chaque personne à la colonne de SON entité, jamais à une autre', () => {
    const map = buildOrgInfluenceMap(tf1())!
    const dsi = map.columns.find(c => c.entity?.id === 'e-dsi')!
    expect(dsi.people.map(p => p.id)).toEqual(['p-cto', 'p-achat'])
    const groupe = map.columns.find(c => c.entity?.id === 'e-groupe')!
    expect(groupe.people.map(p => p.id)).toEqual(['p-dg'])
  })

  it('range les personnes sans entité dans une colonne « rattachement inconnu », sans inventer de parent', () => {
    const map = buildOrgInfluenceMap(tf1())!
    const unassigned = map.columns.find(c => c.entity === null)!
    expect(unassigned.people.map(p => p.id)).toEqual(['p-orphelin'])
    expect(map.links.some(l => l.toId === 'p-orphelin')).toBe(false)
  })

  it('ordonne les personnes d’une colonne par niveau hiérarchique (L0 → L5)', () => {
    const map = buildOrgInfluenceMap(tf1())!
    const dsi = map.columns.find(c => c.entity?.id === 'e-dsi')!
    expect(dsi.people.map(p => p.level)).toEqual(['L2', 'L5'])
  })

  it('classe la couleur du nœud sur la donnée réelle, et « unknown » quand elle manque', () => {
    const map = buildOrgInfluenceMap(tf1())!
    const byId = new Map(map.columns.flatMap(c => c.people).map(p => [p.id, p]))
    expect(byId.get('p-dg')!.category).toBe('sponsor')
    expect(byId.get('p-cto')!.category).toBe('field')
    expect(byId.get('p-achat')!.category).toBe('procurement')
    // Ni niveau, ni rôle : la carte ne lui attribue aucune catégorie.
    expect(byId.get('p-orphelin')!.category).toBe('unknown')
    expect(byId.get('p-orphelin')!.level).toBeNull()
  })

  it('trace le lien entité→entité depuis parentId, et le lien personne→entité depuis member_of', () => {
    const map = buildOrgInfluenceMap(tf1())!
    expect(map.links).toContainEqual({
      fromId: 'e-groupe',
      toId: 'e-dsi',
      nature: 'entity_tree',
      verified: true,
      confidence: null,
      sources: [],
    })
    // Le member_of du graphe porte son score : le trait reprend CE score.
    expect(map.links).toContainEqual({
      fromId: 'e-dsi',
      toId: 'p-cto',
      nature: 'member_of',
      verified: false,
      confidence: 60,
      sources: [],
    })
  })

  it('trace un rattachement sans score quand le graphe connaît l’entité mais pas le lien', () => {
    const map = buildOrgInfluenceMap(tf1())!
    // p-achat est rattaché à e-dsi par `entityId`, sans edge member_of correspondant.
    expect(map.links).toContainEqual({
      fromId: 'e-dsi',
      toId: 'p-achat',
      nature: 'member_of',
      verified: false,
      confidence: null,
      sources: [],
    })
  })

  it('reporte les lignes reports_to entre personnes affichées', () => {
    const map = buildOrgInfluenceMap(tf1())!
    expect(map.links).toContainEqual({
      fromId: 'p-cto',
      toId: 'p-achat',
      nature: 'reports_to',
      verified: false,
      confidence: 70,
      sources: [],
    })
  })

  /**
   * #2121.34 — un lien PERSONNE↔PERSONNE hors hiérarchie : ni l'un ni l'autre
   * ne dépend de l'autre. Avant ce point, `works_with` n'existait dans AUCUN
   * schéma (`orgHierarchyRelationSchema` n'avait que 5 valeurs) : un tel edge
   * n'aurait même pas pu être validé, encore moins dessiné.
   */
  it('trace un lien "works_with" entre deux personnes affichées (#2121.34)', () => {
    const map = buildOrgInfluenceMap(
      tf1({
        hierarchyEdges: [
          ...tf1().hierarchyEdges,
          { fromId: 'p-cto', toId: 'p-achat', type: 'works_with', sourceIds: [], confidence: 40, verified: false },
        ],
      }),
    )!
    expect(map.links).toContainEqual({
      fromId: 'p-cto',
      toId: 'p-achat',
      nature: 'works_with',
      verified: false,
      confidence: 40,
      sources: [],
    })
  })

  /**
   * #2121.32 — jusqu'ici, une `influenceEdge` n'alimentait QUE `person.projects`
   * (le `topic`) : le LIEN lui-même — QUI influence QUI — n'apparaissait dans
   * aucun trait dessinable. `verified` reste `false` par construction : une
   * influence est une inférence (D405), jamais un fait sourcé au sens strict.
   */
  it('trace un lien "influences" entre les deux personnes de l’edge (#2121.32)', () => {
    const map = buildOrgInfluenceMap(
      tf1({
        influenceEdges: [
          {
            fromId: 'p-cto',
            toId: 'p-dg',
            topic: 'Graph:ID',
            stance: 'supporter',
            confidence: 62,
            reasoning: 'sponsor du programme data',
            sourceIds: [],
          },
        ],
      }),
    )!
    expect(map.links).toContainEqual({
      fromId: 'p-cto',
      toId: 'p-dg',
      nature: 'influences',
      verified: false,
      confidence: 62,
      sources: [],
    })
  })

  it('place une zone blanche SOUS l’entité qu’elle concerne, et ignore celle qui n’en nomme aucune', () => {
    const map = buildOrgInfluenceMap(tf1())!
    const pub = map.columns.find(c => c.entity?.id === 'e-pub')!
    expect(pub.gaps).toHaveLength(1)
    expect(pub.gaps[0]?.family).toBe('Data / Adtech')
    expect(map.columns.flatMap(c => c.gaps)).toHaveLength(1)
  })

  it('expose les axes d’exploration réellement présents (entité, métier, niveau)', () => {
    const map = buildOrgInfluenceMap(tf1())!
    expect(map.facets.entities.map(e => e.id)).toEqual(['e-groupe', 'e-pub', 'e-dsi'])
    expect(map.facets.families).toEqual(['Achats', 'Data / Adtech', 'Direction', 'IT / Cloud'])
    expect(map.facets.levels).toEqual(['L1', 'L2', 'L5'])
  })

  it('expose les projets d’influence comme axe, et les porte sur les personnes concernées', () => {
    const map = buildOrgInfluenceMap(
      tf1({
        influenceEdges: [
          {
            fromId: 'p-cto',
            toId: 'p-dg',
            topic: 'Graph:ID',
            stance: 'supporter',
            confidence: 62,
            reasoning: 'sponsor du programme data',
          },
          {
            fromId: 'p-achat',
            toId: 'p-cto',
            topic: 'Cloud 2026',
            stance: 'neutral',
            confidence: 55,
            reasoning: 'arbitre le budget cloud',
          },
        ],
      }),
    )!
    expect(map.facets.projects).toEqual(['Cloud 2026', 'Graph:ID'])
    const byId = new Map(map.columns.flatMap(c => c.people).map(p => [p.id, p]))
    expect(byId.get('p-cto')!.projects).toEqual(['Cloud 2026', 'Graph:ID'])
    expect(byId.get('p-dg')!.projects).toEqual(['Graph:ID'])
    // Personne sans influence : aucun projet, jamais inventé.
    expect(byId.get('p-orphelin')!.projects).toEqual([])
  })

  /* ── « Chaque nœud porte source, date, statut et confiance » (p32) ───────── */

  it('porte sur la personne son statut d’identité et ses sources datées', () => {
    const map = buildOrgInfluenceMap(
      tf1({
        people: [
          {
            id: 'p-dg',
            fullName: 'Alice Directrice',
            entityId: 'e-groupe',
            identityStatus: 'enriched',
            decisionRoles: ['economic_buyer'],
            confidence: 92,
            sources: [
              { id: 's1', kind: 'official_site', grounding: 'A', date: '2026-05-12', ref: 'https://tf1.fr/direction' },
            ],
          },
        ],
        hierarchyEdges: [],
      }),
    )!
    const person = map.columns.flatMap(c => c.people).find(p => p.id === 'p-dg')!
    expect(person.identityStatus).toBe('enriched')
    expect(person.sources).toEqual([
      { id: 's1', kind: 'official_site', grounding: 'A', date: '2026-05-12', ref: 'https://tf1.fr/direction' },
    ])
  })

  it('porte sur l’entité son pays et ses sources — l’ontologie p6 dit « pays vérifié »', () => {
    const map = buildOrgInfluenceMap(
      tf1({
        entities: [
          {
            id: 'e-groupe',
            name: 'Groupe TF1',
            type: 'groupe',
            parentId: null,
            confidence: 92,
            status: 'operating',
            country: 'FR',
            sources: [{ id: 's-reg', kind: 'registry', grounding: 'A', date: '2026-04-01' }],
          },
        ],
        people: [
          {
            id: 'p-dg',
            fullName: 'Alice Directrice',
            entityId: 'e-groupe',
            identityStatus: 'classified',
            decisionRoles: [],
            confidence: 92,
          },
        ],
        hierarchyEdges: [],
        uncoveredZones: [],
      }),
    )!
    expect(map.roots[0]?.country).toBe('FR')
    expect(map.roots[0]?.sources.map(s => s.kind)).toEqual(['registry'])
  })

  it('porte sur la zone blanche son stock estimé et ses requêtes (p18)', () => {
    const map = buildOrgInfluenceMap(tf1())!
    const gap = map.columns.flatMap(c => c.gaps)[0]!
    expect(gap.estimatedAvailable).toBeNull()
    expect(gap.suggestedQueries).toEqual([])

    const stocked = buildOrgInfluenceMap(
      tf1({
        uncoveredZones: [
          {
            entityId: 'e-pub',
            family: 'Data / Adtech',
            hierarchyLevel: 'L2',
            importance: 'critique',
            reason: 'Aucun contact Data chez TF1 Pub',
            suggestedTitles: ['Head of Data'],
            suggestedQueries: ['Head of Data TF1 Pub'],
            estimatedAvailable: 30,
          },
        ],
      }),
    )!
    const zone = stocked.columns.flatMap(c => c.gaps)[0]!
    expect(zone.estimatedAvailable).toBe(30)
    expect(zone.suggestedQueries).toEqual(['Head of Data TF1 Pub'])
  })

  it('expose les rôles d’achat comme axe d’exploration, sans « unknown » (filtrer sur « on ne sait pas » n’a pas de sens)', () => {
    const map = buildOrgInfluenceMap(
      tf1({
        people: [
          {
            id: 'p-a',
            fullName: 'A',
            entityId: 'e-dsi',
            identityStatus: 'classified',
            decisionRoles: ['champion'],
            confidence: 70,
          },
          {
            id: 'p-b',
            fullName: 'B',
            entityId: 'e-dsi',
            identityStatus: 'classified',
            decisionRoles: ['unknown'],
            confidence: 50,
          },
        ],
        hierarchyEdges: [],
      }),
    )!
    expect(map.facets.roles).toEqual(['champion'])
  })
})

describe('filterOrgInfluenceMap', () => {
  it('sans filtre, renvoie la carte inchangée', () => {
    const map = buildOrgInfluenceMap(tf1())!
    expect(filterOrgInfluenceMap(map, {})).toEqual(map)
  })

  it('filtre par entité : ne garde que cette colonne (et sa racine)', () => {
    const map = filterOrgInfluenceMap(buildOrgInfluenceMap(tf1())!, { entityId: 'e-dsi' })
    expect(map.columns.map(c => c.entity?.id ?? null)).toEqual(['e-groupe', 'e-dsi'])
  })

  it('filtre par métier : ne garde que les personnes de cette famille, et les zones de cette famille', () => {
    const map = filterOrgInfluenceMap(buildOrgInfluenceMap(tf1())!, { family: 'IT / Cloud' })
    expect(map.columns.flatMap(c => c.people).map(p => p.id)).toEqual(['p-cto'])
    expect(map.columns.flatMap(c => c.gaps)).toHaveLength(0)
  })

  it('filtre par niveau', () => {
    const map = filterOrgInfluenceMap(buildOrgInfluenceMap(tf1())!, { level: 'L5' })
    expect(map.columns.flatMap(c => c.people).map(p => p.id)).toEqual(['p-achat'])
  })

  it('filtre par rôle d’achat : ne garde que les personnes qui le portent', () => {
    const map = filterOrgInfluenceMap(buildOrgInfluenceMap(tf1())!, { role: 'procurement' })
    expect(map.columns.flatMap(c => c.people).map(p => p.id)).toEqual(['p-achat'])
  })

  it('filtre par rôle : les zones blanches sortent — un trou ne porte aucun rôle', () => {
    const map = filterOrgInfluenceMap(buildOrgInfluenceMap(tf1())!, { role: 'economic_buyer' })
    expect(map.columns.flatMap(c => c.gaps)).toHaveLength(0)
  })

  it('filtre par confiance minimale : sous le seuil, la personne sort', () => {
    const map = filterOrgInfluenceMap(buildOrgInfluenceMap(tf1())!, { minConfidence: 90 })
    expect(map.columns.flatMap(c => c.people).map(p => p.id)).toEqual(['p-dg'])
  })

  it('filtre par confiance : les zones blanches RESTENT — un trou n’est pas une affirmation peu sûre', () => {
    const map = filterOrgInfluenceMap(buildOrgInfluenceMap(tf1())!, { minConfidence: 90 })
    expect(map.columns.flatMap(c => c.gaps)).toHaveLength(1)
  })

  it('filtre par projet : ne garde que les personnes qui pèsent dessus, zones exclues', () => {
    const base = buildOrgInfluenceMap(
      tf1({
        influenceEdges: [
          {
            fromId: 'p-cto',
            toId: 'p-dg',
            topic: 'Graph:ID',
            stance: 'supporter',
            confidence: 62,
            reasoning: 'sponsor',
          },
        ],
      }),
    )!
    const map = filterOrgInfluenceMap(base, { project: 'Graph:ID' })
    const ids = map.columns
      .flatMap(c => c.people)
      .map(p => p.id)
      .sort()
    expect(ids).toEqual(['p-cto', 'p-dg'])
    expect(map.columns.flatMap(c => c.gaps)).toHaveLength(0)
  })

  it('ne laisse jamais un trait pointer vers un nœud filtré', () => {
    const map = filterOrgInfluenceMap(buildOrgInfluenceMap(tf1())!, { level: 'L5' })
    const ids = new Set([
      ...map.roots.map(r => r.id),
      ...map.columns.flatMap(c => [c.entity?.id, ...c.people.map(p => p.id), ...c.gaps.map(g => g.id)]),
    ])
    for (const link of map.links) {
      expect(ids.has(link.fromId)).toBe(true)
      expect(ids.has(link.toId)).toBe(true)
    }
  })
})

/* ── Un lien dit d'où il vient ─────────────────────────────────────────────── */

/**
 * Le trait est ce sur quoi le commercial DÉCIDE : c'est lui qui affirme « cette
 * personne dépend de celle-là ». Tant qu'il ne porte pas ses preuves, un
 * rattachement déduit et un rattachement prouvé sont le MÊME objet dans le
 * modèle — et l'écran n'a plus que le style du trait pour les séparer.
 */
function withSourcedAttachment(overrides: Record<string, unknown> = {}): OrgGraph {
  return orgGraphSchema.parse({
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
        sources: [{ id: 's-linkedin', kind: 'linkedin', grounding: 'B', date: '2026-02-03' }],
      },
    ],
    hierarchyEdges: [
      // Prouvé : l'organigramme officiel porte ce rattachement.
      { fromId: 'p-cto', toId: 'e-dsi', type: 'member_of', sourceIds: ['s-orgchart'], confidence: 95, verified: true },
      // Deviné, mais appuyé : un profil public est un indice, pas une preuve.
      {
        fromId: 'p-achat',
        toId: 'e-dsi',
        type: 'member_of',
        sourceIds: ['s-linkedin'],
        confidence: 70,
        verified: false,
      },
    ],
    influenceEdges: [],
    buyingCommittee: [],
    uncoveredZones: [],
    recommendedPath: [],
    rejectedItems: [],
    ...overrides,
  })
}

describe('un trait porte ses propres preuves', () => {
  it('résout les sourceIds de l’edge en sources datées, portées PAR LE LIEN', () => {
    const map = buildOrgInfluenceMap(withSourcedAttachment())!
    const link = map.links.find(l => l.nature === 'member_of' && l.toId === 'p-cto')!
    expect(link.sources).toEqual([{ id: 's-orgchart', kind: 'org_chart', grounding: 'A', date: '2026-05-12' }])
  })

  it('un lien dont aucun sourceId ne retombe sur une preuve reste SANS source — on ne lui en fabrique pas', () => {
    // Dans `tf1()`, les edges citent des sourceIds qu'aucun nœud ne porte.
    const map = buildOrgInfluenceMap(tf1())!
    for (const link of map.links) expect(link.sources).toEqual([])
  })

  it('un rattachement que seul `entityId` porte n’a ni edge ni preuve', () => {
    const map = buildOrgInfluenceMap(withSourcedAttachment())!
    expect(map.links.find(l => l.nature === 'entity_tree')!.sources).toEqual([])
  })

  it('orgLinkOrigin — sourcé ⇔ vérifié ET une preuve résolue', () => {
    const map = buildOrgInfluenceMap(withSourcedAttachment())!
    const sourced = map.links.find(l => l.nature === 'member_of' && l.toId === 'p-cto')!
    const supported = map.links.find(l => l.nature === 'member_of' && l.toId === 'p-achat')!
    const tree = map.links.find(l => l.nature === 'entity_tree')!

    expect(orgLinkOrigin(sourced)).toBe('sourced')
    // Appuyé sur un profil public, mais pas vérifié : ça reste une hypothèse.
    expect(orgLinkOrigin(supported)).toBe('assumed')
    expect(orgLinkOrigin(tree)).toBe('structure')
  })

  it('orgLinkOrigin — un lien « vérifié » dont la preuve est introuvable ne se présente PAS comme sourcé', () => {
    // Le contrat garantit qu'un edge vérifié CITE au moins un sourceId ; il ne
    // garantit pas que ce sourceId retombe sur une preuve réellement émise. Sans
    // preuve à MONTRER, on ne peut pas dire « sourcé » — ce serait la provenance
    // fabriquée que la règle interdit.
    const map = buildOrgInfluenceMap(
      withSourcedAttachment({
        people: [
          {
            id: 'p-cto',
            fullName: 'Bruno Cloud',
            entityId: 'e-dsi',
            decisionRoles: [],
            identityStatus: 'classified',
            confidence: 95,
            sources: [],
          },
        ],
        hierarchyEdges: [
          {
            fromId: 'p-cto',
            toId: 'e-dsi',
            type: 'member_of',
            sourceIds: ['s-fantome'],
            confidence: 95,
            verified: true,
          },
        ],
      }),
    )!
    const orphan = map.links.find(l => l.nature === 'member_of' && l.toId === 'p-cto')!
    expect(orphan.verified).toBe(true)
    expect(orphan.sources).toEqual([])
    expect(orgLinkOrigin(orphan)).toBe('assumed')
  })
})

/**
 * Référence D38 — ce que CHAQUE trait des deux jeux d'essai affirme aujourd'hui.
 *
 * La règle du trait déménage vers le contrat ; ce qu'elle rend, non. Ces deux
 * relevés sont verts AVANT le déménagement et doivent l'être APRÈS : c'est la
 * preuve, trait par trait, que l'écran ne bouge pas.
 */
describe('l’origine de chaque trait — état de référence', () => {
  const relevé = (graph: OrgGraph): string[] =>
    buildOrgInfluenceMap(graph)!
      .links.map(link => `${link.nature} ${link.fromId}→${link.toId} = ${orgLinkOrigin(link)}`)
      .sort()

  it('le graphe TF1 : aucun rattachement prouvé, l’arbre des entités seul est structurel', () => {
    expect(relevé(tf1())).toEqual([
      'entity_tree e-groupe→e-dsi = structure',
      'entity_tree e-groupe→e-pub = structure',
      'member_of e-dsi→p-achat = assumed',
      'member_of e-dsi→p-cto = assumed',
      'member_of e-groupe→p-dg = assumed',
      'reports_to p-cto→p-achat = assumed',
    ])
  })

  it('le graphe à rattachement sourcé : un seul trait a le droit de se dire prouvé', () => {
    expect(relevé(withSourcedAttachment())).toEqual([
      'entity_tree e-groupe→e-dsi = structure',
      'member_of e-dsi→p-achat = assumed',
      'member_of e-dsi→p-cto = sourced',
    ])
  })

  it('la règle vient du CONTRAT, pas d’une copie locale (D38)', () => {
    // Deux règles qui se ressemblent divergent : il a suffi d'une pour que le
    // même lien puisse se dire « sourcé » ici et « hypothèse » là-bas.
    const links = [...buildOrgInfluenceMap(tf1())!.links, ...buildOrgInfluenceMap(withSourcedAttachment())!.links]
    expect(links.length).toBeGreaterThan(0)
    for (const link of links) expect(orgLinkOrigin(link)).toBe(contractLinkOrigin(link))
  })
})
