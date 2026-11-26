import { describe, expect, it } from 'vitest'
import { canDrawOrgChart, orgLinkOrigin, partitionOrgHierarchy, toOrgViews } from './org-views.js'

const GRAPH = {
  entities: [{ id: 'e1' }],
  hierarchyEdges: [
    { type: 'reports_to', verified: true, from: 'p1', to: 'p2' },
    { type: 'reports_to', verified: false, confidence: 95, from: 'p3', to: 'p2' },
  ],
  influenceEdges: [{ type: 'influences', confidence: 60 }],
  buyingCommittee: { economic: 'p2' },
  recommendedPath: [{ name: 'Tomasz' }],
}

describe('les quatre vues de l’organigramme (§50)', () => {
  it('« vérifié » n’accepte que les liens sourcés', () => {
    const views = toOrgViews(GRAPH)
    expect(views.verifiedOrganisation.edges).toHaveLength(1)
    expect(views.verifiedOrganisation.edges[0]?.from).toBe('p1')
  })

  it('un lien non sourcé bascule dans la carte d’influence, avec les influences', () => {
    const views = toOrgViews(GRAPH)
    expect(views.influenceMap.edges).toHaveLength(2)
  })

  it('une inférence à 95 % reste une inférence — le partage se fait sur la SOURCE', () => {
    // Un seuil de confiance ferait basculer des hypothèses du côté des faits
    // sans que personne ne l'ait décidé. C'est exactement le glissement que le
    // §49 interdit : le lecteur décide de son approche sur les flèches.
    const views = toOrgViews({ hierarchyEdges: [{ verified: false, confidence: 99 }] })
    expect(views.verifiedOrganisation.edges).toHaveLength(0)
    expect(views.counts).toEqual({ verified: 0, inferred: 1 })
  })

  it('dit combien de liens sont prouvés sur le total', () => {
    // « 3 liens sur 17 sont sourcés » est une information ; un arbre complet
    // sans cette mention laisse croire à un organigramme officiel.
    expect(toOrgViews(GRAPH).counts).toEqual({ verified: 1, inferred: 1 })
  })

  it('sans aucun lien sourcé, on ne dessine PAS d’organigramme (§52)', () => {
    // Un organigramme partiellement inventé est plus nuisible qu'une carte
    // assumée : une carte sans flèches laisse chercher, ce qui est le bon
    // comportement quand on ne sait pas.
    expect(canDrawOrgChart(toOrgViews({ hierarchyEdges: [{ verified: false }] }))).toBe(false)
    expect(canDrawOrgChart(toOrgViews(GRAPH))).toBe(true)
  })

  it('un graphe absent ne casse pas la projection', () => {
    const views = toOrgViews(null)
    expect(views.recommendedPath).toEqual([])
    expect(views.counts).toEqual({ verified: 0, inferred: 0 })
  })
})

describe('le partage brut, à un seul endroit (D38)', () => {
  it('rend deux listes dans l’ORDRE reçu', () => {
    // Le web rend ensuite ces listes ; un tri ici superposerait deux tris et
    // changerait l'affichage sans que personne l'ait demandé.
    const { verified, inferred } = partitionOrgHierarchy([
      { id: 'a', verified: false },
      { id: 'b', verified: true },
      { id: 'c', verified: false },
      { id: 'd', verified: true },
    ])
    expect(verified.map(e => e['id'])).toEqual(['b', 'd'])
    expect(inferred.map(e => e['id'])).toEqual(['a', 'c'])
  })

  it('un lien qui ne DIT rien de sa vérification est une hypothèse', () => {
    // L'absence de drapeau n'est pas une preuve. Le repli est l'hypothèse,
    // jamais le fait — c'est le sens de `!== true` plutôt que de `=== false`.
    const { verified, inferred } = partitionOrgHierarchy([{ id: 'muet' }, { id: 'nul', verified: undefined }])
    expect(verified).toEqual([])
    expect(inferred).toHaveLength(2)
  })

  it('sans lien, deux listes vides — jamais rien d’autre', () => {
    expect(partitionOrgHierarchy(undefined)).toEqual({ verified: [], inferred: [] })
    expect(partitionOrgHierarchy(null)).toEqual({ verified: [], inferred: [] })
    expect(partitionOrgHierarchy([])).toEqual({ verified: [], inferred: [] })
  })

  it('les quatre vues LISENT cette partition, elles n’en refont pas une', () => {
    const views = toOrgViews(GRAPH)
    const { verified, inferred } = partitionOrgHierarchy(GRAPH.hierarchyEdges)
    expect(views.verifiedOrganisation.edges).toEqual(verified)
    expect(views.counts).toEqual({ verified: verified.length, inferred: inferred.length })
    // La carte d'influence, elle, ajoute les influences derrière les inférences.
    expect(views.influenceMap.edges).toEqual([...inferred, ...GRAPH.influenceEdges])
  })
})

describe('ce qu’un trait a le droit d’AFFIRMER (D38)', () => {
  it('l’arbre des entités est une STRUCTURE, pas une inférence sur une personne', () => {
    expect(orgLinkOrigin({ nature: 'entity_tree', verified: true, sources: [] })).toBe('structure')
    // Même sans drapeau : la forme du groupe ne se déduit pas d'une personne.
    expect(orgLinkOrigin({ nature: 'entity_tree', verified: false, sources: [] })).toBe('structure')
  })

  it('« sourcé » exige une preuve MONTRABLE, pas seulement le drapeau', () => {
    const showable = { nature: 'member_of', verified: true, sources: [{ id: 's-orgchart' }] } as const
    expect(orgLinkOrigin(showable)).toBe('sourced')
    // Le contrat garantit qu'un lien vérifié CITE une source ; il ne garantit
    // pas que cette citation retombe sur une preuve réellement émise. Sans
    // preuve à MONTRER, dire « sourcé » fabriquerait une provenance.
    expect(orgLinkOrigin({ nature: 'member_of', verified: true, sources: [] })).toBe('assumed')
  })

  it('tout le reste est une hypothèse — un score élevé ne fait pas basculer un lien', () => {
    expect(orgLinkOrigin({ nature: 'reports_to', verified: false, sources: [{ id: 's-linkedin' }] })).toBe('assumed')
  })

  it('la règle du TRAIT est plus stricte que le partage brut — sciemment', () => {
    // Le même lien : compté « vérifié » par la partition (c'est ce que le graphe
    // DÉCLARE) et « hypothèse » par le trait (c'est ce que l'écran peut
    // MONTRER). Les deux règles vivent ici, côte à côte, pour que personne ne
    // les « unifie » en croyant supprimer un doublon.
    const edge = { verified: true, sourceIds: ['s-fantome'] }
    expect(partitionOrgHierarchy([edge]).verified).toHaveLength(1)
    expect(orgLinkOrigin({ nature: 'member_of', verified: true, sources: [] })).toBe('assumed')
  })

  /**
   * #2121.35 — TROISIÈME état, distinct de « vérifié » (une source externe,
   * `official_site`/`org_chart`/…) et de « probable » (`assumed`) : un lien
   * qu'un COMMERCIAL a déclaré depuis le terrain (`OrgCorrectionDrawer` →
   * `org-graph-correction.ts:475`, source `kind: 'workspace_user'`).
   *
   * Avant ce point, une correction humaine posait `verified: true` et
   * retombait dans le même panier que « vérifié par l'organigramme officiel »
   * — indistinguable au clic, alors que la FORCE de la preuve n'est pas la
   * même (une déclaration n'est pas un document tiers).
   */
  it('une déclaration terrain (workspace_user) est un troisième état, pas « vérifié »', () => {
    const declared = {
      nature: 'reports_to',
      verified: true,
      sources: [{ id: 's-terrain', kind: 'workspace_user' }],
    } as const
    expect(orgLinkOrigin(declared)).toBe('declared')
    // Une source classique reste « vérifié » — le nouvel état ne mange pas
    // l'ancien.
    expect(
      orgLinkOrigin({ nature: 'reports_to', verified: true, sources: [{ id: 's-off', kind: 'official_site' }] }),
    ).toBe('sourced')
  })
})
