import { orgGraphSchema, type OrgCorrectionClaim, type OrgGraph } from '@bellum/contracts'
import { applyOrgCorrections, edgeKey, invertCorrection, parseEdgeKey, replayCorrections } from './org-graph-correction'

/** Un graphe minimal mais complet : deux entités, trois personnes, un lien vérifié. */
const graph = (): OrgGraph =>
  orgGraphSchema.parse({
    graphVersion: 4,
    entities: [
      { id: 'e-groupe', name: 'Acme Groupe', type: 'groupe', parentId: null, confidence: 95 },
      { id: 'e-dsi', name: 'DSI', type: 'bu', parentId: 'e-groupe', confidence: 90 },
    ],
    people: [
      {
        id: 'p-julien-nicolas',
        fullName: 'Julien Nicolas',
        title: 'DSI',
        entityId: 'e-dsi',
        hierarchyLevel: 'L1',
        decisionRoles: ['economic_buyer'],
        identityStatus: 'classified',
        confidence: 80,
        sources: [{ id: 's-li', kind: 'linkedin', grounding: 'B' }],
      },
      {
        id: 'p-claire-dubois',
        fullName: 'Claire Dubois',
        title: 'Directrice de programme',
        entityId: 'e-dsi',
        hierarchyLevel: 'L2',
        decisionRoles: ['champion'],
        identityStatus: 'classified',
        confidence: 70,
        sources: [],
      },
      {
        id: 'p-thomas-roy',
        fullName: 'Thomas Roy',
        title: 'Architecte',
        entityId: 'e-dsi',
        hierarchyLevel: 'L4',
        decisionRoles: ['user_buyer'],
        identityStatus: 'classified',
        confidence: 60,
        sources: [],
      },
    ],
    hierarchyEdges: [
      {
        fromId: 'p-claire-dubois',
        toId: 'p-julien-nicolas',
        type: 'reports_to',
        sourceIds: ['s-off'],
        confidence: 95,
        verified: true,
      },
    ],
    influenceEdges: [],
    buyingCommittee: [],
    uncoveredZones: [],
    recommendedPath: [{ step: 1, personId: 'p-julien-nicolas', objective: 'Ouvrir' }],
    rejectedItems: [],
  })

const claim = (over: Partial<OrgCorrectionClaim> = {}): OrgCorrectionClaim =>
  ({
    field: 'title',
    value: 'Directeur des Systèmes d’Information',
    reason: 'Page « gouvernance » du site officiel',
    evidence: { kind: 'official_site', ref: 'https://acme.fr/gouvernance', date: '2026-08-20', claim: 'title' },
    ...over,
  }) as OrgCorrectionClaim

const apply = (
  claims: OrgCorrectionClaim[],
  over: { objectType?: 'person' | 'entity' | 'edge'; objectId?: string; base?: OrgGraph } = {},
) =>
  applyOrgCorrections(over.base ?? graph(), {
    version: 5,
    objectType: over.objectType ?? 'person',
    objectId: over.objectId ?? 'p-julien-nicolas',
    claims,
    at: '2026-08-29T10:00:00.000Z',
  })

describe('la clé d’un lien', () => {
  it('fait l’aller-retour sans perdre d’information', () => {
    const key = edgeKey({ fromId: 'p-a', toId: 'p-b', type: 'reports_to' })
    expect(parseEdgeKey(key)).toEqual({ fromId: 'p-a', toId: 'p-b', type: 'reports_to' })
  })

  it('refuse une clé qui n’en est pas une plutôt que d’en deviner une', () => {
    expect(parseEdgeKey('p-a')).toBeNull()
    expect(parseEdgeKey('p-a|nawak|p-b')).toBeNull()
  })
})

describe('corriger une personne', () => {
  it('écrit le titre, bump la version, et pose la preuve SUR la personne', () => {
    const result = apply([claim()])
    expect(result).not.toBeNull()
    const person = result!.graph.people.find(p => p.id === 'p-julien-nicolas')!
    expect(person.title).toBe('Directeur des Systèmes d’Information')
    expect(result!.graph.graphVersion).toBe(5)
    const posee = person.sources.find(s => s.id === 's-correction-p-julien-nicolas-title')!
    expect(posee).toBeDefined()
    // La source posée est CE QUI PROUVE, pas « une correction » en général.
    expect(posee.kind).toBe('official_site')
    // Une correction humaine est une preuve de rang A.
    expect(posee.grounding).toBe('A')
    // Provenance = la source ET la date — celle de la PREUVE quand on l'a.
    expect(posee.date).toBe('2026-08-20')
    // Une preuve dit ce qu'elle prouve.
    expect(posee.claim).toBe('title')
    // La preuve d'avant n'est pas effacée : on archive, on ne supprime pas.
    expect(person.sources.some(s => s.id === 's-li')).toBe(true)
  })

  it('date le geste quand la preuve elle-même n’est pas datée — jamais aucune des deux', () => {
    const result = apply([claim({ evidence: { kind: 'workspace_user', claim: 'title' } })])
    const posee = result!.graph.people[0]!.sources.find(s => s.id === 's-correction-p-julien-nicolas-title')!
    expect(posee.kind).toBe('workspace_user')
    expect(posee.date).toBe('2026-08-29T10:00:00.000Z')
  })

  it('remplace la preuve du MÊME champ plutôt que d’empiler dix preuves du même fait', () => {
    const once = apply([claim()])!
    const twice = applyOrgCorrections(once.graph, {
      version: 6,
      objectType: 'person',
      objectId: 'p-julien-nicolas',
      claims: [claim({ value: 'Directeur du numérique' })],
      at: '2026-08-29T12:00:00.000Z',
    })!
    const correctionSources = twice.graph.people[0]!.sources.filter(s => s.id.startsWith('s-correction-'))
    expect(correctionSources).toHaveLength(1)
  })

  it('rend le détail de CHAQUE champ : l’avant et l’après, pour le ledger', () => {
    const result = apply([claim()])
    expect(result!.applied).toEqual([
      { field: 'title', oldValue: 'DSI', newValue: 'Directeur des Systèmes d’Information' },
    ])
  })

  it('distingue « la valeur était absente » de « la valeur était vide »', () => {
    const base = graph()
    base.people[0]!.title = undefined
    const result = applyOrgCorrections(base, {
      version: 5,
      objectType: 'person',
      objectId: 'p-julien-nicolas',
      claims: [claim()],
      at: '2026-08-29T10:00:00.000Z',
    })
    expect(result!.applied[0]!.oldValue).toBeNull()
  })

  it('efface un titre qu’on sait faux : la personne redevient SANS titre connu', () => {
    const result = apply([claim({ value: null })])
    expect(result!.graph.people.find(p => p.id === 'p-julien-nicolas')!.title).toBeUndefined()
    expect(result!.applied[0]!.newValue).toBeNull()
  })

  it('rattache à une entité qui EXISTE', () => {
    const result = apply([
      claim({
        field: 'entityId',
        value: 'e-groupe',
        evidence: { kind: 'workspace_user', claim: 'membership' },
      }),
    ])
    expect(result!.graph.people.find(p => p.id === 'p-julien-nicolas')!.entityId).toBe('e-groupe')
  })

  it('REFUSE de rattacher à une entité inconnue — on n’invente jamais une branche', () => {
    const result = apply([
      claim({ field: 'entityId', value: 'e-inventee', evidence: { kind: 'workspace_user', claim: 'membership' } }),
    ])
    expect(result).toBeNull()
  })

  it('écrit le niveau hiérarchique et refuse un niveau qui n’existe pas', () => {
    expect(
      apply([claim({ field: 'hierarchyLevel', value: 'L2', evidence: { kind: 'workspace_user', claim: 'level' } })])!
        .graph.people[0]!.hierarchyLevel,
    ).toBe('L2')
    expect(
      apply([claim({ field: 'hierarchyLevel', value: 'L9', evidence: { kind: 'workspace_user', claim: 'level' } })]),
    ).toBeNull()
  })

  it('écrit les rôles de décision et refuse un rôle inconnu', () => {
    expect(
      apply([
        claim({
          field: 'decisionRoles',
          value: ['champion', 'technical_buyer'],
          evidence: { kind: 'workspace_user', claim: 'roles' },
        }),
      ])!.graph.people[0]!.decisionRoles,
    ).toEqual(['champion', 'technical_buyer'])
    expect(
      apply([
        claim({ field: 'decisionRoles', value: ['patron'], evidence: { kind: 'workspace_user', claim: 'roles' } }),
      ]),
    ).toBeNull()
  })

  it('applique plusieurs champs en UNE correction, chacun avec sa ligne de ledger', () => {
    const result = apply([
      claim(),
      claim({ field: 'hierarchyLevel', value: 'L2', evidence: { kind: 'workspace_user', claim: 'level' } }),
    ])
    expect(result!.applied.map(a => a.field)).toEqual(['title', 'hierarchyLevel'])
  })

  it('ne rend RIEN quand la personne visée n’existe pas — on ne la fabrique pas', () => {
    expect(apply([claim()], { objectId: 'p-fantome' })).toBeNull()
  })

  it('ne produit aucune ligne quand la valeur est déjà celle-là — pas de bruit dans le ledger', () => {
    const result = apply([claim({ value: 'DSI' })])
    expect(result!.applied).toEqual([])
  })
})

describe('corriger le N+1', () => {
  const reportsTo = (value: string | null) =>
    claim({ field: 'reportsTo', value, evidence: { kind: 'workspace_user', claim: 'relation' } })

  it('crée un lien VÉRIFIÉ vers le nouveau manager — une affirmation humaine est une preuve de rang A', () => {
    const result = apply([reportsTo('p-claire-dubois')], { objectId: 'p-thomas-roy' })
    const edge = result!.graph.hierarchyEdges.find(e => e.fromId === 'p-thomas-roy' && e.type === 'reports_to')!
    expect(edge.toId).toBe('p-claire-dubois')
    expect(edge.verified).toBe(true)
    expect(edge.confidence).toBeGreaterThanOrEqual(90)
    expect(edge.sourceIds.length).toBeGreaterThan(0)
  })

  it('remplace le lien existant plutôt que d’en empiler un second', () => {
    const result = apply([reportsTo('p-thomas-roy')], { objectId: 'p-claire-dubois' })
    const edges = result!.graph.hierarchyEdges.filter(e => e.fromId === 'p-claire-dubois' && e.type === 'reports_to')
    expect(edges).toHaveLength(1)
    expect(edges[0]!.toId).toBe('p-thomas-roy')
  })

  it('rend le N+1 INCONNU quand on retire le lien — le fait périmé ne disparaît pas en silence', () => {
    const result = apply([reportsTo(null)], { objectId: 'p-claire-dubois' })
    expect(result!.graph.hierarchyEdges.filter(e => e.fromId === 'p-claire-dubois')).toHaveLength(0)
    expect(result!.applied[0]).toEqual({ field: 'reportsTo', oldValue: 'p-julien-nicolas', newValue: null })
  })

  it('REFUSE un manager introuvable — jamais un lien vers « le plus proche »', () => {
    expect(apply([reportsTo('p-inconnu')], { objectId: 'p-thomas-roy' })).toBeNull()
  })

  it('REFUSE qu’une personne rapporte à elle-même', () => {
    expect(apply([reportsTo('p-thomas-roy')], { objectId: 'p-thomas-roy' })).toBeNull()
  })

  it('REFUSE un cycle de reporting', () => {
    // Claire rapporte déjà à Julien ; faire rapporter Julien à Claire boucle.
    expect(apply([reportsTo('p-claire-dubois')], { objectId: 'p-julien-nicolas' })).toBeNull()
  })
})

describe('corriger une entité', () => {
  it('renomme une entité', () => {
    const result = apply(
      [claim({ field: 'name', value: 'Direction des SI', evidence: { kind: 'workspace_user', claim: 'identity' } })],
      {
        objectType: 'entity',
        objectId: 'e-dsi',
      },
    )
    expect(result!.graph.entities.find(e => e.id === 'e-dsi')!.name).toBe('Direction des SI')
  })

  it('REFUSE un cycle de rattachement d’entités', () => {
    const result = apply(
      [claim({ field: 'parentId', value: 'e-dsi', evidence: { kind: 'workspace_user', claim: 'membership' } })],
      { objectType: 'entity', objectId: 'e-groupe' },
    )
    expect(result).toBeNull()
  })
})

describe('corriger un lien', () => {
  const key = 'p-claire-dubois|reports_to|p-julien-nicolas'

  it('retire un lien — et le graphe reste valide', () => {
    const result = apply(
      [claim({ field: 'presence', value: 'absent', evidence: { kind: 'workspace_user', claim: 'relation' } })],
      { objectType: 'edge', objectId: key },
    )
    expect(result!.graph.hierarchyEdges).toHaveLength(0)
    expect(result!.applied[0]).toEqual({ field: 'presence', oldValue: 'present', newValue: 'absent' })
  })

  it('ajoute un lien absent, vérifié et sourcé', () => {
    const result = apply(
      [claim({ field: 'presence', value: 'present', evidence: { kind: 'workspace_user', claim: 'relation' } })],
      { objectType: 'edge', objectId: 'p-thomas-roy|reports_to|p-claire-dubois' },
    )
    expect(result!.graph.hierarchyEdges).toHaveLength(2)
  })

  it('REFUSE un lien dont une extrémité n’est pas un nœud du graphe', () => {
    expect(
      apply([claim({ field: 'presence', value: 'present', evidence: { kind: 'workspace_user', claim: 'relation' } })], {
        objectType: 'edge',
        objectId: 'p-thomas-roy|reports_to|p-fantome',
      }),
    ).toBeNull()
  })
})

describe('le graphe résultant est TOUJOURS re-validé', () => {
  it('ne rend jamais un graphe que le contrat refuserait', () => {
    // Retirer Julien du chemin est impossible par correction, mais rattacher
    // quelqu'un à une entité inexistante l'est — et doit être refusé.
    const result = apply([
      claim({ field: 'entityId', value: 'e-neant', evidence: { kind: 'workspace_user', claim: 'membership' } }),
    ])
    expect(result).toBeNull()
  })
})

describe('une correction survit à un rebuild', () => {
  const entry = (over: Record<string, unknown> = {}) => ({
    objectType: 'person' as const,
    objectId: 'p-julien-nicolas',
    field: 'title' as const,
    newValue: 'Directeur des Systèmes d’Information',
    reason: 'Site officiel',
    evidence: { kind: 'official_site' as const, claim: 'title' as const },
    at: '2026-08-29T10:00:00.000Z',
    ...over,
  })

  it('réapplique la correction sur le graphe QUE LE RUN VIENT D’ÉCRIRE', () => {
    // Le run a tout réassemblé à neuf : le titre est redevenu celui de la
    // source. Sans rejeu, la correction humaine disparaîtrait sans un mot.
    const fresh = graph()
    const next = replayCorrections(fresh, [entry()])
    expect(next).not.toBeNull()
    expect(next!.people.find(p => p.id === 'p-julien-nicolas')!.title).toBe('Directeur des Systèmes d’Information')
    // Le rejeu ne bump PAS la version : ce n'est pas un nouveau geste.
    expect(next!.graphVersion).toBe(fresh.graphVersion)
  })

  it('rejoue les corrections dans l’ORDRE — la dernière gagne', () => {
    const next = replayCorrections(graph(), [
      entry({ newValue: 'DSI Groupe' }),
      entry({ newValue: 'Directeur du numérique' }),
    ])
    expect(next!.people[0]!.title).toBe('Directeur du numérique')
  })

  it('SAUTE une correction dont la cible a disparu, sans perdre les autres', () => {
    // La personne n'est plus dans le graphe (elle a quitté, ou la vague ne l'a
    // pas ramenée). Sa correction reste au ledger : si elle revient, elle
    // reprend. En attendant, elle ne fait pas échouer les autres.
    const next = replayCorrections(graph(), [
      entry({ objectId: 'p-partie-ailleurs' }),
      entry({ objectId: 'p-claire-dubois', newValue: 'Directrice générale adjointe' }),
    ])
    expect(next).not.toBeNull()
    expect(next!.people.find(p => p.id === 'p-claire-dubois')!.title).toBe('Directrice générale adjointe')
  })

  it('rend `null` quand il n’y a rien à rejouer — l’appelant laisse le graphe tel quel', () => {
    expect(replayCorrections(graph(), [])).toBeNull()
  })

  it('n’invente pas de preuve : le rejeu repose la source d’origine, avec sa date', () => {
    const next = replayCorrections(graph(), [entry()])
    const source = next!.people[0]!.sources.find(s => s.id === 's-correction-p-julien-nicolas-title')!
    expect(source.kind).toBe('official_site')
    expect(source.claim).toBe('title')
    expect(source.date).toBe('2026-08-29T10:00:00.000Z')
  })

  /**
   * #2310.54 — une correction d'ENTITÉ survit à un rebuild EXACTEMENT comme
   * une correction de personne : même fonction (`applyOrgCorrections`), même
   * rejeu (`replayCorrections`), aucun traitement spécial par `objectType`.
   * « Une correction humaine gagne toujours, quelle que soit sa date » ne vaut
   * rien si elle ne tient QUE sur une personne.
   */
  it('une correction d’ENTITÉ survit au rebuild — même mécanisme que pour une personne', () => {
    const fresh = graph()
    const next = replayCorrections(fresh, [
      entry({
        objectType: 'entity',
        objectId: 'e-dsi',
        field: 'name',
        newValue: 'Direction des Systèmes d’Information',
        evidence: { kind: 'official_site', claim: 'identity' },
      }),
    ])
    expect(next).not.toBeNull()
    expect(next!.entities.find(e => e.id === 'e-dsi')!.name).toBe('Direction des Systèmes d’Information')
    // Rejeu, pas un nouveau geste : la version ne bouge pas.
    expect(next!.graphVersion).toBe(fresh.graphVersion)
  })
})

describe('annuler une correction', () => {
  it('rend le claim inverse : la valeur d’avant redevient la valeur voulue', () => {
    const inverse = invertCorrection({
      field: 'title',
      oldValue: 'DSI',
      newValue: 'Directeur des Systèmes d’Information',
      evidence: { kind: 'official_site', claim: 'title' },
      reason: 'Page gouvernance',
    })
    expect(inverse.value).toBe('DSI')
    expect(inverse.field).toBe('title')
    // L'annulation est elle-même un geste humain : sa preuve le dit.
    expect(inverse.evidence.kind).toBe('workspace_user')
    expect(inverse.evidence.claim).toBe('title')
  })

  it('remet la valeur d’avant DANS le graphe, et le ledger en garde trace', () => {
    const corrected = apply([claim()])!
    const inverse = invertCorrection({
      field: 'title',
      oldValue: corrected.applied[0]!.oldValue,
      newValue: corrected.applied[0]!.newValue,
      evidence: { kind: 'official_site', claim: 'title' },
      reason: 'Correction erronée',
    })
    const back = applyOrgCorrections(corrected.graph, {
      version: 6,
      objectType: 'person',
      objectId: 'p-julien-nicolas',
      claims: [inverse],
      at: '2026-08-29T11:00:00.000Z',
    })
    expect(back!.graph.people.find(p => p.id === 'p-julien-nicolas')!.title).toBe('DSI')
    expect(back!.graph.graphVersion).toBe(6)
  })
})
