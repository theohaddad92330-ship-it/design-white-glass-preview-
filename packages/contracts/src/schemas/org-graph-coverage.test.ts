import { describe, expect, it } from 'vitest'
import {
  deriveOrgCoverage,
  orgHasHierarchyEdges,
  orgCoverageSchema,
  orgGraphSchema,
  type OrgGraph,
} from './org-graph.js'

/**
 * #2543.5a/.5b/.5c — pourquoi le stock est mince : l'état de la source
 * Apollo, la population qu'elle ANNONCE, et le résultat du repli web.
 * `orgCoverageSchema` accepte ces trois clés (additif, aucune requise) et
 * `deriveOrgCoverage` les porte jusqu'au bandeau, à l'octet près de ce que
 * `apps/ia/app/services/org_graph_assembler.py` pose déjà.
 */
describe('orgCoverageSchema — pourquoi le stock est mince (#2543.5)', () => {
  it('accepte sourceStatus + sourceTotalEntries', () => {
    const parsed = orgCoverageSchema.parse({
      discovered: 5,
      deterministicClassified: 5,
      llmEnriched: 5,
      sourceStatus: 'plan_blocked',
      sourceTotalEntries: 6,
    })
    expect(parsed.sourceStatus).toBe('plan_blocked')
    expect(parsed.sourceTotalEntries).toBe(6)
  })

  it('refuse un état de source inconnu — jamais une valeur devinée', () => {
    expect(() =>
      orgCoverageSchema.parse({
        discovered: 5,
        deterministicClassified: 5,
        llmEnriched: 5,
        sourceStatus: 'mostly_fine',
      }),
    ).toThrow()
  })

  it('accepte le repli web — tenté, trouvé, ou un échec nommé', () => {
    const parsed = orgCoverageSchema.parse({
      discovered: 5,
      deterministicClassified: 5,
      llmEnriched: 5,
      fallback: { attempted: true, failure: 'brave timeout' },
    })
    expect(parsed.fallback).toEqual({ attempted: true, failure: 'brave timeout' })
  })

  // #2755.1 — SOPRA STERIA GROUP : `orgGraph.coverage.fallback` existait dans
  // `raw_analysis` avec `failure: null` et `foundCount: null` (le producteur
  // Python pose la clé même sans valeur). `.optional()` refuse `null`, donc
  // `orgGraphSchema.safeParse` échouait sur un graphe par ailleurs complet
  // (2191 personnes, 10 entités, 26 liens) et l'écran affichait « Pas encore
  // de graphe d'organigramme » au lieu du graphe réel.
  it('#2755.1 — accepte fallback.failure/foundCount à null (repli tenté, rien à nommer)', () => {
    const parsed = orgCoverageSchema.parse({
      discovered: 5,
      deterministicClassified: 5,
      llmEnriched: 5,
      fallback: { attempted: false, failure: null, foundCount: null },
    })
    expect(parsed.fallback).toEqual({ attempted: false, failure: null, foundCount: null })
  })

  it('un graphe SANS ces clés reste valide — dossier antérieur au chantier', () => {
    const parsed = orgCoverageSchema.parse({ discovered: 5, deterministicClassified: 5, llmEnriched: 5 })
    expect(parsed.sourceStatus).toBeUndefined()
    expect(parsed.sourceTotalEntries).toBeUndefined()
    expect(parsed.fallback).toBeUndefined()
  })
})

describe('deriveOrgCoverage — pourquoi le stock est mince, jusqu’au bandeau', () => {
  it('porte sourceStatus/sourceTotalEntries/fallback quand la couverture les mesure', () => {
    const header = deriveOrgCoverage(
      graphWith({
        discovered: 5,
        deterministicClassified: 5,
        llmEnriched: 5,
        sourceStatus: 'plan_blocked',
        sourceTotalEntries: 6,
        fallback: { attempted: true, foundCount: 0 },
      }),
    )
    expect(header.sourceStatus).toBe('plan_blocked')
    expect(header.sourceTotalEntries).toBe(6)
    expect(header.fallback).toEqual({ attempted: true, foundCount: 0 })
  })

  it('reste null/undefined quand la source n’a jamais été mesurée — jamais « ok » deviné', () => {
    const header = deriveOrgCoverage(graphWith({ discovered: 5, deterministicClassified: 5, llmEnriched: 5 }))
    expect(header.sourceStatus).toBeNull()
    expect(header.sourceTotalEntries).toBeNull()
    expect(header.fallback).toBeNull()
  })

  // #2755.1 — reproduit SOPRA STERIA GROUP : un graphe par ailleurs complet
  // (entités, personnes, liens hiérarchiques) dont `coverage.fallback` porte
  // `failure: null`/`foundCount: null` doit rester un orgGraph VALIDE, pas un
  // safeParse échoué qui rend l'écran muet (« Pas encore de graphe »).
  it('#2755.1 — un orgGraph complet dont coverage.fallback porte null reste valide', () => {
    const result = orgGraphSchema.safeParse({
      graphVersion: 1,
      entities: [{ id: 'e-g', name: 'Sopra Steria Group', type: 'groupe', parentId: null, confidence: 90 }],
      people: [
        {
          id: 'p-a',
          fullName: 'Alice A',
          entityId: 'e-g',
          decisionRoles: ['economic_buyer'],
          identityStatus: 'enriched',
          confidence: 80,
        },
      ],
      hierarchyEdges: [],
      uncoveredZones: [],
      coverage: {
        discovered: 5,
        deterministicClassified: 5,
        llmEnriched: 5,
        fallback: { attempted: false, failure: null, foundCount: null },
      },
    })
    expect(result.success).toBe(true)
  })
})

/**
 * La couverture décorrélée de l'enrichissement (PDF-22 FINAL §3).
 *
 * Le défaut que ces tests tiennent : `CONTACTS_ENRICH_MAX` (50) plafonnait le
 * GRAPHE, pas seulement la vague IA. Sur un compte à 2 241 contacts découverts,
 * l'écran en montrait 30 à 50 et rien ne disait que le reste existait.
 */

/** Un graphe minimal valide, sur lequel poser une couverture. */
const graphWith = (coverage?: unknown): OrgGraph =>
  orgGraphSchema.parse({
    graphVersion: 1,
    entities: [{ id: 'e-g', name: 'Airbus SE', type: 'groupe', parentId: null, confidence: 90 }],
    people: [
      {
        id: 'p-a',
        fullName: 'Alice A',
        entityId: 'e-g',
        decisionRoles: ['economic_buyer'],
        identityStatus: 'enriched',
        confidence: 80,
      },
      {
        id: 'p-b',
        fullName: 'Bob B',
        entityId: 'e-g',
        decisionRoles: [],
        identityStatus: 'classified',
        confidence: 70,
      },
    ],
    hierarchyEdges: [
      { fromId: 'p-b', toId: 'p-a', type: 'reports_to', sourceIds: ['s1'], confidence: 92, verified: true },
      { fromId: 'p-b', toId: 'e-g', type: 'member_of', sourceIds: [], confidence: 70, verified: false },
    ],
    uncoveredZones: [{ reason: 'aucun achat identifié', importance: 'critique' }],
    ...(coverage === undefined ? {} : { coverage }),
  })

describe('orgCoverageSchema — ce qu’une vague a mesuré du compte', () => {
  it('accepte les compteurs du bandeau AIRBUS de la spec', () => {
    const parsed = orgCoverageSchema.parse({
      discovered: 2241,
      attachedToEntity: 1978,
      deterministicClassified: 2103,
      llmEnriched: 613,
      enrichmentBatchSize: 50,
    })
    expect(parsed.discovered).toBe(2241)
    expect(parsed.enrichmentBatchSize).toBe(50)
  })

  it('refuse un enrichi supérieur au découvert — une vague n’enrichit pas plus que le compte', () => {
    const bad = orgCoverageSchema.safeParse({
      discovered: 50,
      attachedToEntity: 50,
      deterministicClassified: 50,
      llmEnriched: 51,
    })
    expect(bad.success).toBe(false)
  })

  it('refuse un rattaché ou un classé supérieur au découvert', () => {
    expect(
      orgCoverageSchema.safeParse({
        discovered: 10,
        attachedToEntity: 11,
        deterministicClassified: 10,
        llmEnriched: 10,
      }).success,
    ).toBe(false)
    expect(
      orgCoverageSchema.safeParse({
        discovered: 10,
        attachedToEntity: 10,
        deterministicClassified: 11,
        llmEnriched: 10,
      }).success,
    ).toBe(false)
  })

  it('accepte une couverture SANS rattachement — le trou est nommé, pas comblé par un 0', () => {
    const parsed = orgCoverageSchema.parse({
      discovered: 2241,
      deterministicClassified: 2103,
      llmEnriched: 50,
    })
    expect(parsed.attachedToEntity).toBeUndefined()
  })

  it('accepte un compte réellement vide — 0 découvert est une mesure, pas une absence', () => {
    const parsed = orgCoverageSchema.parse({
      discovered: 0,
      attachedToEntity: 0,
      deterministicClassified: 0,
      llmEnriched: 0,
    })
    expect(parsed.discovered).toBe(0)
  })
})

describe('orgGraphSchema — la couverture est additive', () => {
  it('un graphe SANS couverture reste valide (dossier antérieur au chantier)', () => {
    expect(graphWith(undefined).coverage).toBeUndefined()
  })

  it('un graphe AVEC couverture la conserve à la relecture', () => {
    const graph = graphWith({
      discovered: 2241,
      attachedToEntity: 1978,
      deterministicClassified: 2103,
      llmEnriched: 613,
      enrichmentBatchSize: 50,
    })
    // Ré-analyse le graphe déjà validé : c'est ce que fait chaque correction
    // (`applyOrgGraphCorrection` re-parse le résultat). Un champ absent du
    // schéma serait SILENCIEUSEMENT effacé par zod — la couverture
    // disparaîtrait au premier « ce contact est parti ».
    const reparsed = orgGraphSchema.parse(graph)
    expect(reparsed.coverage?.discovered).toBe(2241)
  })
})

describe('deriveOrgCoverage — le bandeau, dérivé à UN seul endroit', () => {
  it('rend les sept compteurs du bandeau quand la couverture a été mesurée', () => {
    const header = deriveOrgCoverage(
      graphWith({
        discovered: 2241,
        attachedToEntity: 1978,
        deterministicClassified: 2103,
        llmEnriched: 613,
        enrichmentBatchSize: 50,
      }),
    )
    expect(header).toMatchObject({
      discovered: 2241,
      attachedToEntity: 1978,
      unassigned: 2241 - 1978,
      deterministicClassified: 2103,
      llmEnriched: 613,
      remainingEnrichment: 2241 - 613,
      enrichmentBatchSize: 50,
      hierarchyVerified: 1,
      hierarchyProbable: 1,
      uncoveredZones: 1,
    })
  })

  it('« non mesuré » n’est jamais « 0 » : sans bloc coverage, les compteurs de corpus sont null', () => {
    const header = deriveOrgCoverage(graphWith(undefined))
    expect(header.discovered).toBeNull()
    expect(header.attachedToEntity).toBeNull()
    expect(header.unassigned).toBeNull()
    expect(header.deterministicClassified).toBeNull()
    expect(header.llmEnriched).toBeNull()
    expect(header.remainingEnrichment).toBeNull()
    expect(header.enrichmentBatchSize).toBeNull()
  })

  it('les liens, eux, sont TOUJOURS mesurables — le graphe les porte', () => {
    const header = deriveOrgCoverage(graphWith(undefined))
    expect(header.hierarchyVerified).toBe(1)
    expect(header.hierarchyProbable).toBe(1)
    expect(header.uncoveredZones).toBe(1)
  })

  it('un graphe sans aucun lien annonce zéro lien vérifié — ici « 0 » est VRAI', () => {
    const bare = orgGraphSchema.parse({ graphVersion: 1 })
    const header = deriveOrgCoverage(bare)
    expect(header.hierarchyVerified).toBe(0)
    expect(header.hierarchyProbable).toBe(0)
    expect(header.discovered).toBeNull()
  })

  it('la taille de vague reste absente quand le run ne l’a pas dite', () => {
    const header = deriveOrgCoverage(
      graphWith({ discovered: 120, attachedToEntity: 100, deterministicClassified: 110, llmEnriched: 50 }),
    )
    expect(header.enrichmentBatchSize).toBeNull()
    expect(header.remainingEnrichment).toBe(70)
  })

  it('un rattachement non mesuré rend « rattachés » ET « non rattachés » à null', () => {
    // Le piège que ce test ferme : dériver `unassigned = discovered - 0` aurait
    // annoncé « 2 241 personnes sans entité » sur un compte dont on ignore
    // simplement le rattachement. Un zéro qui ment en produit un second.
    const header = deriveOrgCoverage(
      graphWith({ discovered: 2241, deterministicClassified: 2103, llmEnriched: 50, enrichmentBatchSize: 50 }),
    )
    expect(header.discovered).toBe(2241)
    expect(header.attachedToEntity).toBeNull()
    expect(header.unassigned).toBeNull()
    expect(header.remainingEnrichment).toBe(2191)
  })

  /* ---------------------------------------------------------------- */
  /*  Le corpus VIVANT — l'écran en sait parfois plus que le run       */
  /* ---------------------------------------------------------------- */

  it('le corpus vivant du dossier l’emporte sur l’instantané du run', () => {
    // Le run a mesuré 2 000 contacts ; depuis, une recherche ciblée en a ajouté
    // 241. L'écran, lui, compte la liste RÉELLE. Sans cette entrée, un appelant
    // qui connaît le vrai total devait le recalculer à côté — c'est-à-dire
    // refaire la dérivation, ce que la loi 1 du tome 7 interdit.
    const header = deriveOrgCoverage(graphWith({ discovered: 2000, deterministicClassified: 1800, llmEnriched: 50 }), {
      discovered: 2241,
    })
    expect(header.discovered).toBe(2241)
  })

  it('un appelant qui ne connaît pas le corpus retombe sur la mesure du run', () => {
    const header = deriveOrgCoverage(graphWith({ discovered: 2000, deterministicClassified: 1800, llmEnriched: 50 }), {
      discovered: null,
    })
    expect(header.discovered).toBe(2000)
  })

  it('le corpus vivant ne DÉRIVE rien : le reste reste ancré sur ce que le run a mesuré', () => {
    // Le piège que ce test ferme : recalculer `remainingEnrichment` sur le total
    // vivant ferait dire « il reste 2 191 contacts à enrichir » à un run qui n'en
    // a jamais vu que 2 000. Le compteur de reste appartient au run, pas à
    // l'écran ; seul `discovered` se rafraîchit.
    const header = deriveOrgCoverage(graphWith({ discovered: 2000, deterministicClassified: 1800, llmEnriched: 50 }), {
      discovered: 2241,
    })
    expect(header.remainingEnrichment).toBe(1950)
    expect(header.unassigned).toBeNull()
  })

  it('un corpus vivant sur un dossier JAMAIS mesuré donne le total, et rien d’autre', () => {
    const header = deriveOrgCoverage(graphWith(undefined), { discovered: 2241 })
    expect(header.discovered).toBe(2241)
    // Savoir combien de contacts existent ne dit RIEN de ce qu'une vague en a
    // approfondi. Écrire « 0 enrichi » ici serait la faute que ce fichier existe
    // pour empêcher.
    expect(header.llmEnriched).toBeNull()
    expect(header.deterministicClassified).toBeNull()
    expect(header.remainingEnrichment).toBeNull()
    expect(header.attachedToEntity).toBeNull()
  })
})

describe('la décorrélation elle-même', () => {
  it('le nombre de nœuds du graphe ne borne PAS le nombre de contacts découverts', () => {
    // 2 241 découverts, 50 enrichis, 2 personnes projetées dans le graphe : les
    // trois nombres sont indépendants. C'est exactement ce que le plafond à 50
    // rendait impossible — il faisait dire « 2 » à un compte qui en a 2 241.
    const header = deriveOrgCoverage(
      graphWith({
        discovered: 2241,
        attachedToEntity: 1978,
        deterministicClassified: 2103,
        llmEnriched: 50,
        enrichmentBatchSize: 50,
      }),
    )
    expect(header.discovered).toBe(2241)
    expect(header.llmEnriched).toBe(50)
    expect(header.remainingEnrichment).toBe(2191)
  })
})

describe('orgHasHierarchyEdges — Louis 12/10/2026 : trois zéros ne se montrent pas', () => {
  it('un graphe SANS aucune arête n’a pas de hiérarchie connue (les trois compteurs se taisent)', () => {
    expect(orgHasHierarchyEdges({ hierarchyVerified: 0, hierarchyProbable: 0 })).toBe(false)
  })

  it('une arête, vérifiée ou probable, suffit : un vrai 0 reste un 0 à côté', () => {
    expect(orgHasHierarchyEdges({ hierarchyVerified: 0, hierarchyProbable: 3 })).toBe(true)
    expect(orgHasHierarchyEdges({ hierarchyVerified: 1, hierarchyProbable: 0 })).toBe(true)
  })

  it('lit le bandeau dérivé d’un graphe réel : nu → non, avec arêtes → oui', () => {
    expect(orgHasHierarchyEdges(deriveOrgCoverage(orgGraphSchema.parse({ graphVersion: 1 })))).toBe(false)
    expect(orgHasHierarchyEdges(deriveOrgCoverage(graphWith(undefined)))).toBe(true)
  })
})
