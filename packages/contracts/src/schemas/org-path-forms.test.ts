import { describe, expect, it } from 'vitest'
import { PLAN_FRESH_DAYS, PLAN_STALE_DAYS } from './first-move.js'
import {
  ORG_PATH_FORMS,
  orgGraphSchema,
  orgHopBasisSchema,
  orgPathFormSchema,
  orgPathOriginSchema,
  orgRecommendedStepSchema,
} from './org-graph.js'

/**
 * Le chemin recommandé PART DE TOI et a TROIS formes (tome 5 §27, `T5.md:815-831` ;
 * croisement couche zéro × organigramme, U26/U29 du tome 1).
 *
 * Ce que ce fichier garde, et pourquoi chaque assertion existe :
 *  - les TROIS formes, pas deux ni quatre, et dans un ordre FIGÉ (GA-08) ;
 *  - le saut s'appuie sur un lien MODÉLISÉ du graphe — jamais sur « X connaît Y »,
 *    qui n'existe nulle part dans le dépôt (c'est la raison écrite du refus de
 *    `find_intro_path`, `chat_tools.py:1018`, qu'on ne rouvre pas) ;
 *  - un chemin daté DIT sa péremption, et une relation sans date se lit
 *    « inconnu », jamais « fraîche » (« non mesuré » n'est jamais « 0 »).
 */
describe('les trois formes du chemin recommandé', () => {
  it('en expose exactement TROIS, dans un ordre figé', () => {
    expect(orgPathFormSchema.options).toEqual(['direct', 'one_hop', 'cold'])
    expect(ORG_PATH_FORMS).toEqual(['direct', 'one_hop', 'cold'])
  })

  it("n'appuie un saut que sur un lien MODÉLISÉ du graphe", () => {
    // `same_entity` (appartenance), `hierarchy` (arête hiérarchique) et
    // `influence` (arête d'influence) sont les TROIS liens que le graphe porte
    // réellement. Une quatrième valeur qui dirait « connaît » inventerait la
    // donnée — c'est exactement ce que le refus de `find_intro_path` nomme.
    expect(orgHopBasisSchema.options).toEqual(['same_entity', 'hierarchy', 'influence'])
    expect(orgHopBasisSchema.options).not.toContain('knows')
  })
})

describe('orgPathOriginSchema — le nœud « TOI »', () => {
  it('accepte une entrée froide sans aucune relation, et le dit', () => {
    const parsed = orgPathOriginSchema.parse({ form: 'cold', relationFreshness: 'inconnu' })
    expect(parsed.form).toBe('cold')
    expect(parsed.relation).toBeUndefined()
    expect(parsed.relationDate).toBeUndefined()
    // Le cœur de l'exigence : une relation absente est INCONNUE, jamais fraîche.
    expect(parsed.relationFreshness).toBe('inconnu')
  })

  it('porte la date de la relation ET sa fraîcheur sur une relation directe', () => {
    const parsed = orgPathOriginSchema.parse({
      form: 'direct',
      owner: 'Camille',
      relation: 'ancien client',
      relationDate: '2026-03-04',
      relationFreshness: 'perime',
    })
    expect(parsed.relationDate).toBe('2026-03-04')
    expect(parsed.relationFreshness).toBe('perime')
  })

  it('refuse une date de relation qui ne soit pas une date du calendrier', () => {
    expect(orgPathOriginSchema.safeParse({ form: 'direct', relationDate: 'mars 2026' }).success).toBe(false)
    expect(orgPathOriginSchema.safeParse({ form: 'direct', relationDate: '2026-3-4' }).success).toBe(false)
  })

  it('refuse un saut sans la base qui le rend crédible', () => {
    expect(
      orgPathOriginSchema.safeParse({
        form: 'one_hop',
        relationFreshness: 'inconnu',
        hop: { personId: 'p1' },
      }).success,
    ).toBe(false)
  })

  it('accepte un saut porté par un lien modélisé et ses sources', () => {
    const parsed = orgPathOriginSchema.parse({
      form: 'one_hop',
      relationFreshness: 'frais',
      hop: { personId: 'p1', basis: 'same_entity', sourceIds: ['s1'] },
    })
    expect(parsed.hop?.basis).toBe('same_entity')
    expect(parsed.hop?.sourceIds).toEqual(['s1'])
  })

  it('exige un intermédiaire quand la forme est « à un saut »', () => {
    // Une forme `one_hop` sans `hop` serait un saut qui ne dit pas par qui —
    // soit exactement la promesse creuse que l'exigence interdit.
    expect(orgPathOriginSchema.safeParse({ form: 'one_hop', relationFreshness: 'frais' }).success).toBe(false)
  })

  it("interdit un intermédiaire quand il n'y a pas de saut", () => {
    expect(
      orgPathOriginSchema.safeParse({
        form: 'direct',
        relationFreshness: 'frais',
        hop: { personId: 'p1', basis: 'hierarchy' },
      }).success,
    ).toBe(false)
  })
})

describe('le raccord au graphe est ADDITIF', () => {
  const base = {
    graphVersion: 1,
    entities: [],
    people: [],
    hierarchyEdges: [],
    influenceEdges: [],
    buyingCommittee: [],
    uncoveredZones: [],
    recommendedPath: [],
    rejectedItems: [],
  }

  it('accepte un graphe ANTÉRIEUR au chantier, sans origine de chemin', () => {
    const parsed = orgGraphSchema.parse(base)
    expect(parsed.pathOrigin).toBeUndefined()
  })

  it("accepte un graphe qui porte l'origine", () => {
    const parsed = orgGraphSchema.parse({
      ...base,
      pathOrigin: { form: 'cold', relationFreshness: 'inconnu' },
    })
    expect(parsed.pathOrigin?.form).toBe('cold')
  })

  it("laisse l'étape recommandée telle qu'elle était", () => {
    // Les champs historiques ne bougent pas : un dossier stocké se relit à
    // l'identique. C'est la contrepartie d'un ajout additif.
    const parsed = orgRecommendedStepSchema.parse({ step: 1, personId: 'p1', objective: 'ouvrir' })
    expect(parsed).toEqual({ step: 1, personId: 'p1', objective: 'ouvrir' })
  })
})

describe('les seuils de péremption ne sont pas redéclarés', () => {
  it('réutilise ceux du plan (un réglage vit à UN seul endroit, GA-26)', () => {
    // La source écrit « ⚠ relation de 5 mois, à revalider » : cinq mois passent
    // le second seuil. On ne pose pas un troisième couple de seuils dans le
    // produit pour redire ce que `first-move.ts` dit déjà.
    expect(PLAN_FRESH_DAYS).toBe(30)
    expect(PLAN_STALE_DAYS).toBe(90)
  })
})
