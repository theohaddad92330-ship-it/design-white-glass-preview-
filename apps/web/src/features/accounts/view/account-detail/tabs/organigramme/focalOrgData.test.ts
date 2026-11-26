import { ORG_REPORTING_INFLUENCE_TOPIC, orgGraphSchema, type OrgGraph } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import {
  buildFocalOrgView,
  buildOrgGroupView,
  decisionBadgeOf,
  defaultFocalDirectionId,
  listFocalDirections,
  measureGeneratorColouring,
  orgRootEntityIds,
  personDecisionRole,
  unenrichedOrgContacts,
} from './focalOrgData'

/* ------------------------------------------------------------------ */
/*  Un graphe de travail : trois entités, cinq niveaux, des achats     */
/* ------------------------------------------------------------------ */

const SOURCE = { id: 's-off', kind: 'official_site' as const, grounding: 'A' as const, date: '2026-08-01' }

function person(over: Record<string, unknown>) {
  return {
    identityStatus: 'classified' as const,
    confidence: 60,
    sources: [],
    decisionRoles: [],
    ...over,
  }
}

function graph(over: Record<string, unknown> = {}): OrgGraph {
  return orgGraphSchema.parse({
    graphVersion: 3,
    entities: [
      { id: 'e-grp', name: 'AIRBUS SE', type: 'groupe', parentId: null, confidence: 95, sources: [SOURCE] },
      { id: 'e-ds', name: 'AIRBUS DS', type: 'filiale', parentId: 'e-grp', confidence: 90, sources: [SOURCE] },
      { id: 'e-eng', name: 'Engineering', type: 'bu', parentId: 'e-ds', confidence: 80, sources: [] },
    ],
    people: [
      // L1, décideur budget → Sponsor.
      person({
        id: 'p-schoellhorn',
        fullName: 'M. Schoellhorn',
        title: 'CEO Defence & Space',
        entityId: 'e-ds',
        hierarchyLevel: 'L1',
        decisionRoles: ['economic_buyer'],
        identityStatus: 'actionable',
        confidence: 92,
        sources: [SOURCE],
      }),
      // L2 champion + technical buyer → Influenceur (jamais Sponsor par défaut).
      person({
        id: 'p-werner',
        fullName: 'Claudia Werner',
        title: 'Engineering Director',
        entityId: 'e-eng',
        hierarchyLevel: 'L2',
        decisionRoles: ['champion', 'technical_buyer'],
        identityStatus: 'actionable',
        confidence: 78,
      }),
      // L3 sans rôle nommé → Opérationnel (le niveau, pas une autorité).
      person({
        id: 'p-dupont',
        fullName: 'Jean Dupont',
        title: 'Head of Engineering',
        entityId: 'e-eng',
        hierarchyLevel: 'L3',
        decisionRoles: [],
      }),
      // L4 bloqueur → reste dans la structure, atténué.
      person({
        id: 'p-perrin',
        fullName: 'Lucas Perrin',
        title: 'Systems Architect',
        entityId: 'e-eng',
        hierarchyLevel: 'L4',
        decisionRoles: ['blocker'],
      }),
      // Achats : L5, hors de l'arbre hiérarchique.
      person({
        id: 'p-klein',
        fullName: 'Sarah Klein',
        title: 'Category Manager',
        entityId: 'e-ds',
        hierarchyLevel: 'L5',
        decisionRoles: ['procurement'],
      }),
      // Achats sans L5 : le RÔLE suffit à sortir de l'arbre.
      person({
        id: 'p-bernard',
        fullName: 'Nina Bernard',
        title: 'Acheteuse IT',
        entityId: 'e-eng',
        hierarchyLevel: 'L4',
        decisionRoles: ['procurement'],
      }),
      // Sans niveau : elle n'est rangée à AUCUN niveau inventé.
      person({ id: 'p-martin', fullName: 'Paul Martin', title: 'VP Programs', entityId: 'e-eng' }),
    ],
    hierarchyEdges: [
      {
        fromId: 'p-werner',
        toId: 'p-schoellhorn',
        type: 'reports_to',
        sourceIds: [SOURCE.id],
        confidence: 95,
        verified: true,
      },
      { fromId: 'p-dupont', toId: 'p-werner', type: 'reports_to', sourceIds: [], confidence: 62, verified: false },
    ],
    influenceEdges: [],
    buyingCommittee: [{ personId: 'p-schoellhorn', role: 'economic_buyer', entityId: 'e-ds' }],
    uncoveredZones: [{ entityId: 'e-eng', importance: 'critique', reason: 'aucun contact sécurité' }],
    recommendedPath: [
      { step: 1, personId: 'p-schoellhorn', objective: 'ouvrir le périmètre', unlocks: 'le budget 2027' },
      { step: 2, personId: 'p-werner', objective: 'qualifier le besoin' },
    ],
    rejectedItems: [],
    ...over,
  })
}

/* ------------------------------------------------------------------ */
/*  Les badges de décision — décision 4 du FINAL                      */
/* ------------------------------------------------------------------ */

describe('decisionBadgeOf — Sponsor / Influenceur / Opérationnel / Bloqueur', () => {
  const g = graph()
  const committee = new Set(g.buyingCommittee.map(seat => seat.personId))
  const sponsors = new Set<string>()
  const find = (id: string) => g.people.find(x => x.id === id)!

  it('un décideur budget porte le badge Sponsor', () => {
    expect(decisionBadgeOf(find('p-schoellhorn'), { committee, sponsors })).toBe('sponsor')
  })

  it("un champion n'est PAS automatiquement sponsor — il est Influenceur", () => {
    expect(decisionBadgeOf(find('p-werner'), { committee, sponsors })).toBe('influencer')
  })

  it('un sponsor explicite de programme porte Sponsor même sans rôle économique', () => {
    expect(decisionBadgeOf(find('p-werner'), { committee, sponsors: new Set(['p-werner']) })).toBe('sponsor')
  })

  it('le bloqueur écrase tous les autres rôles', () => {
    expect(decisionBadgeOf(find('p-perrin'), { committee, sponsors })).toBe('blocker')
  })

  it('un L3 sans autorité nommée est Opérationnel', () => {
    expect(decisionBadgeOf(find('p-dupont'), { committee, sponsors })).toBe('operational')
  })

  it('un utilisateur sans siège au comité reste Opérationnel ; avec un siège, il pèse', () => {
    const user = { ...find('p-dupont'), id: 'p-user', decisionRoles: ['user_buyer' as const] }
    expect(decisionBadgeOf(user, { committee, sponsors })).toBe('operational')
    expect(decisionBadgeOf(user, { committee: new Set(['p-user']), sponsors })).toBe('influencer')
  })

  it("sans niveau ni rôle, aucun badge — le graphe ne sait pas, il ne l'invente pas", () => {
    expect(decisionBadgeOf(find('p-martin'), { committee, sponsors })).toBeNull()
  })
})

/* ------------------------------------------------------------------ */
/*  Les directions                                                     */
/* ------------------------------------------------------------------ */

describe('listFocalDirections / defaultFocalDirectionId', () => {
  it('ne liste que les entités qui portent réellement quelqu’un', () => {
    const ids = listFocalDirections(graph()).map(d => d.id)
    expect(ids).toContain('e-ds')
    expect(ids).toContain('e-eng')
    expect(ids).not.toContain('e-grp')
  })

  it('#3121 (beta) — trie par nombre de personnes décroissant, la plus peuplée en premier', () => {
    const directions = listFocalDirections(graph())
    expect(directions.map(d => d.id)).toEqual(['e-ds', 'e-eng'])
    expect(directions[0]?.peopleCount).toBeGreaterThan(directions[1]?.peopleCount ?? 0)
  })

  it('#3121 (beta) — à effectif égal, l’ordre actuel décide (jamais un tri alphabétique)', () => {
    // e-b et e-a portent chacune une personne : à égalité, l'ordre d'apparition
    // dans `graph.people` gagne — un tri alphabétique aurait mis e-a en tête,
    // ce qui n'est pas ce que la décision demande (« égalité → ordre actuel »).
    const g = graph({
      entities: [
        { id: 'e-b', name: 'B', type: 'bu' as const, parentId: null, confidence: 70, sources: [] },
        { id: 'e-a', name: 'A', type: 'bu' as const, parentId: null, confidence: 70, sources: [] },
      ],
      people: [
        person({ id: 'p-b', fullName: 'P B', entityId: 'e-b' }),
        person({ id: 'p-a', fullName: 'P A', entityId: 'e-a' }),
      ],
      hierarchyEdges: [],
      buyingCommittee: [],
      recommendedPath: [],
      uncoveredZones: [],
    })
    expect(listFocalDirections(g).map(d => d.id)).toEqual(['e-b', 'e-a'])
  })

  it('#3121 (beta) — la direction par défaut est TOUJOURS celle qui porte le plus de personnes (sous-arbre), même quand le chemin recommandé pointe une autre entité', () => {
    // e-ds porte 7 personnes en sous-arbre (elle-même + e-eng, sa fille) ;
    // e-eng en porte 5. Le chemin recommandé (`graph()`) commence par
    // p-schoellhorn (e-ds) : ce cas-là ne distingue pas encore les deux
    // règles, il confirme seulement que le résultat reste correct.
    expect(defaultFocalDirectionId(graph())).toBe('e-ds')

    // Le cas qui les distingue : le chemin recommandé commence par p-werner,
    // qui est dans e-eng (5 personnes). L'ANCIENNE règle suivait le chemin
    // jusqu'à e-eng, quel que soit son effectif — exactement le bug relevé en
    // bêta (« toujours afficher l'entité qui a le plus grand nombre de
    // personnes »). e-ds (7) doit rester par défaut.
    const g = graph({ recommendedPath: [{ step: 1, personId: 'p-werner', objective: 'qualifier le besoin' }] })
    expect(defaultFocalDirectionId(g)).toBe('e-ds')
  })

  it('sans chemin recommandé, la direction par défaut reste celle qui porte le plus de personnes', () => {
    expect(defaultFocalDirectionId(graph({ recommendedPath: [] }))).toBe('e-ds')
  })

  it('sans personne rattachée, il n’y a pas de direction — jamais une entité au hasard', () => {
    const empty = graph({
      people: [],
      hierarchyEdges: [],
      buyingCommittee: [],
      recommendedPath: [],
      uncoveredZones: [],
    })
    expect(defaultFocalDirectionId(empty)).toBeNull()
  })
})

/* ------------------------------------------------------------------ */
/*  La vue focale                                                      */
/* ------------------------------------------------------------------ */

describe('buildFocalOrgView', () => {
  it("l'arbre est bâti sur L0-L4, jamais sur les rôles commerciaux", () => {
    const view = buildFocalOrgView(graph(), 'e-ds')!
    expect(view.levelRows.map(row => row.level)).toEqual(['L1', 'L2', 'L3', 'L4'])
  })

  it('une direction inclut ses entités descendantes', () => {
    const view = buildFocalOrgView(graph(), 'e-ds')!
    const names = view.levelRows.flatMap(row => row.people.map(p => p.fullName))
    expect(names).toContain('M. Schoellhorn')
    expect(names).toContain('Claudia Werner')
  })

  it('les Achats vivent dans une colonne à part — hors de l’arbre hiérarchique', () => {
    const view = buildFocalOrgView(graph(), 'e-ds')!
    expect(view.procurement.map(p => p.fullName).sort()).toEqual(['Nina Bernard', 'Sarah Klein'])
    const inTree = view.levelRows.flatMap(row => row.people.map(p => p.id))
    expect(inTree).not.toContain('p-klein')
    expect(inTree).not.toContain('p-bernard')
  })

  it("L5 reste une valeur du contrat : la colonne Achats l'accueille, l'énumération n'est pas rétrécie", () => {
    const view = buildFocalOrgView(graph(), 'e-ds')!
    expect(view.procurement.find(p => p.id === 'p-klein')?.level).toBe('L5')
  })

  it('une personne sans niveau n’est rangée à aucun niveau inventé', () => {
    const view = buildFocalOrgView(graph(), 'e-ds')!
    expect(view.unleveled.map(p => p.id)).toEqual(['p-martin'])
    expect(view.levelRows.flatMap(r => r.people.map(p => p.id))).not.toContain('p-martin')
  })

  it('le bloqueur reste DANS la structure, atténué, et hors du chemin', () => {
    const view = buildFocalOrgView(graph(), 'e-ds')!
    const blocker = view.levelRows.flatMap(r => r.people).find(p => p.id === 'p-perrin')
    expect(blocker).toBeDefined()
    expect(blocker?.attenuated).toBe(true)
    expect(blocker?.badge).toBe('blocker')
    expect(view.path.map(step => step.person.id)).not.toContain('p-perrin')
  })

  it('un bloqueur glissé dans le chemin par le serveur en est retiré ET nommé', () => {
    const g = graph({
      recommendedPath: [
        { step: 1, personId: 'p-perrin', objective: 'ne devrait pas être là' },
        { step: 2, personId: 'p-werner', objective: 'qualifier' },
      ],
    })
    const view = buildFocalOrgView(g, 'e-ds')!
    expect(view.path.map(step => step.person.id)).toEqual(['p-werner'])
    expect(view.excludedBlockers.map(p => p.fullName)).toEqual(['Lucas Perrin'])
  })

  it('le chemin est renuméroté à partir de 1', () => {
    const view = buildFocalOrgView(graph(), 'e-ds')!
    expect(view.path.map(step => step.step)).toEqual([1, 2])
  })

  it("le verdict cite la première étape, sa raison et ce qu'elle débloque", () => {
    const view = buildFocalOrgView(graph(), 'e-ds')!
    expect(view.verdict).toEqual({
      name: 'M. Schoellhorn',
      objective: 'ouvrir le périmètre',
      unlocks: 'le budget 2027',
    })
  })

  it('sans chemin, il n’y a pas de verdict — pas de phrase de remplissage', () => {
    const view = buildFocalOrgView(graph({ recommendedPath: [] }), 'e-ds')!
    expect(view.verdict).toBeNull()
  })

  it('un rattachement non prouvé est DIT ; sans lien, le silence est un état correct', () => {
    const view = buildFocalOrgView(graph(), 'e-ds')!
    const cards = view.levelRows.flatMap(r => r.people)
    expect(cards.find(p => p.id === 'p-werner')?.reporting).toEqual({
      managerId: 'p-schoellhorn',
      managerName: 'M. Schoellhorn',
      verified: true,
      confidence: 95,
      // Une LIGNE du graphe, pas une supposition : elle garde son chiffre, qui
      // est calculé sur des facteurs nommés.
      origin: 'hierarchy',
      // Vérifié ET sourcé : le trait est plein, et il le DÉCLARE.
      linkOrigin: 'sourced',
      sources: [SOURCE],
      reasoning: null,
    })
    // L'identifiant du N+1 est porté : c'est LUI qui donne une cible au geste
    // « vérifier ce lien ». Sans lui, le bouton n'aurait rien à vérifier.
    expect(cards.find(p => p.id === 'p-dupont')?.reporting).toEqual({
      managerId: 'p-werner',
      managerName: 'Claudia Werner',
      verified: false,
      confidence: 62,
      origin: 'hierarchy',
      // Non vérifié : pointillé, quel que soit son score.
      linkOrigin: 'assumed',
      sources: [],
      reasoning: null,
    })
    expect(cards.find(p => p.id === 'p-perrin')?.reporting).toBeNull()
  })

  /**
   * D360 — LE CAS QUI EST DEVENU LE SEUL CAS RÉEL.
   *
   * Depuis le correctif P0 du 29/08, l'assembleur ne produit plus de
   * `reports_to` : un `reportingTo` est une supposition du modèle, donc
   * grounding C, donc rangée en INFLUENCE sous « rattachement hiérarchique ».
   * La carte doit la lire — sinon plus aucun rattachement ne s'affiche, et
   * « vérifier ce lien » n'a plus de sujet.
   */
  it('lit le N+1 SUPPOSÉ quand le graphe ne porte aucune ligne prouvée', () => {
    const view = buildFocalOrgView(
      graph({
        hierarchyEdges: [],
        influenceEdges: [
          {
            fromId: 'p-dupont',
            toId: 'p-werner',
            topic: ORG_REPORTING_INFLUENCE_TOPIC,
            stance: 'unknown',
            confidence: 15,
            reasoning: 'N+1 supposé par le modèle à partir du poste.',
          },
        ],
      }),
      'e-ds',
    )!
    expect(view.contacts.find(p => p.id === 'p-dupont')?.reporting).toEqual({
      managerId: 'p-werner',
      managerName: 'Claudia Werner',
      verified: false,
      // ⚠️ PAS de chiffre. Le graphe en porte un (15), mais c'est un score NU —
      // sans axes — et posé à côté d'un nom de N+1 il se lirait comme une chance
      // que le rattachement soit vrai. Ce qui est vrai, c'est que personne ne
      // l'a observé, et le raisonnement le dit.
      confidence: null,
      origin: 'hypothesis',
      linkOrigin: 'assumed',
      sources: [],
      reasoning: 'N+1 supposé par le modèle à partir du poste.',
    })
  })

  /**
   * #4016 L4.2 (décision Louis 11/10/2026) — le N+1 PROBABLE déduit des
   * intitulés, quand ni le graphe ni l'analyse n'en portent : provenance
   * `inferred`, trait en pointillés (`assumed`), jamais vérifié, jamais sourcé.
   */
  it('déduit un N+1 PROBABLE des intitulés quand rien d’autre ne le dit — en pointillés, jamais vérifié', () => {
    const base = graph()
    const view = buildFocalOrgView(
      orgGraphSchema.parse({
        ...base,
        hierarchyEdges: [],
        influenceEdges: [],
        people: [
          ...base.people,
          person({ id: 'p-dsi', fullName: 'Hélène Morel', title: 'DSI', entityId: 'e-eng', hierarchyLevel: 'L1' }),
          person({
            id: 'p-infra',
            fullName: 'Karim Saïdi',
            title: 'Responsable infrastructure IT',
            entityId: 'e-eng',
            hierarchyLevel: 'L3',
          }),
        ],
      }),
      'e-ds',
    )!
    expect(view.contacts.find(p => p.id === 'p-infra')?.reporting).toEqual({
      managerId: 'p-dsi',
      managerName: 'Hélène Morel',
      verified: false,
      confidence: null,
      origin: 'inferred',
      linkOrigin: 'assumed',
      sources: [],
      reasoning: null,
    })
  })

  it('sait dire NON : une hypothèse de l’analyse gagne sur la déduction des intitulés', () => {
    const base = graph()
    const view = buildFocalOrgView(
      orgGraphSchema.parse({
        ...base,
        hierarchyEdges: [],
        people: [
          ...base.people,
          person({ id: 'p-dsi', fullName: 'Hélène Morel', title: 'DSI', entityId: 'e-eng', hierarchyLevel: 'L1' }),
          person({
            id: 'p-infra',
            fullName: 'Karim Saïdi',
            title: 'Responsable infrastructure IT',
            entityId: 'e-eng',
            hierarchyLevel: 'L3',
          }),
        ],
        influenceEdges: [
          {
            fromId: 'p-infra',
            toId: 'p-werner',
            topic: ORG_REPORTING_INFLUENCE_TOPIC,
            stance: 'unknown',
            confidence: 15,
            reasoning: 'N+1 supposé par le modèle à partir du poste.',
          },
        ],
      }),
      'e-ds',
    )!
    expect(view.contacts.find(p => p.id === 'p-infra')?.reporting?.origin).toBe('hypothesis')
  })

  it('une LIGNE du graphe gagne toujours sur une hypothèse', () => {
    // Le graphe de base porte `p-dupont → p-werner` en `reports_to` inféré (62).
    // Une influence qui désignerait un autre N+1 ne doit pas la remplacer.
    const view = buildFocalOrgView(
      graph({
        influenceEdges: [
          {
            fromId: 'p-dupont',
            toId: 'p-schoellhorn',
            topic: ORG_REPORTING_INFLUENCE_TOPIC,
            stance: 'unknown',
            confidence: 40,
            reasoning: 'N+1 supposé par le modèle à partir du poste.',
          },
        ],
      }),
      'e-ds',
    )!
    const dupont = view.contacts.find(p => p.id === 'p-dupont')?.reporting
    expect(dupont?.managerId).toBe('p-werner')
    expect(dupont?.origin).toBe('hierarchy')
  })

  it('la couverture compte ce que le dossier porte, et jamais un zéro de remplissage', () => {
    const view = buildFocalOrgView(graph(), 'e-ds', { discovered: 2241 })!
    expect(view.coverage.discovered).toBe(2241)
    expect(view.coverage.hierarchyVerified).toBe(1)
    expect(view.coverage.hierarchyProbable).toBe(1)
    expect(view.coverage.uncoveredZones).toBe(1)
  })

  it('un compte dont on ignore le nombre de contacts ne se voit pas attribuer « 0 »', () => {
    expect(buildFocalOrgView(graph(), 'e-ds')!.coverage.discovered).toBeNull()
  })

  /* ---------------------------------------------------------------- */
  /*  Le bandeau ne FABRIQUE plus un chiffre que le contrat refuse     */
  /* ---------------------------------------------------------------- */

  /**
   * D278 (OrgGraph, 30/08/2026). L'écran comptait `graph.people` pour dire
   * « rattachés à une entité » — c'est-à-dire la PROJECTION, bornée par la vague
   * d'enrichissement (`CONTACTS_ENRICH_MAX`, 50). Sur AIRBUS le bandeau écrivait
   * « 2 241 découverts · 43 rattachés », mot pour mot l'exemple que le contrat
   * donne pour expliquer son REFUS de produire ce compteur.
   *
   * « 50 est une taille de VAGUE, pas une limite de couverture » : un compteur
   * qui ne peut jamais dépasser 50 ne mesure pas ce que son libellé promet.
   */
  it('« rattachés » n’est pas fabriqué : le contrat refuse de le mesurer, l’écran le DIT', () => {
    const view = buildFocalOrgView(graph(), 'e-ds', { discovered: 2241 })!
    // Sept personnes portent une entité dans ce graphe. Les compter donnerait
    // « 7 rattachés sur 2 241 » — un chiffre plausible, et faux.
    expect(graph().people.filter(p => p.entityId != null).length).toBe(7)
    expect(view.coverage.attachedToEntity).toBeNull()
    expect(view.coverage.unassigned).toBeNull()
  })

  it('« enrichis » est celui du RUN, jamais un décompte de nœuds projetés', () => {
    // Mesuré sur la démonstration : l'écran annonçait 9 enrichis (les nœuds du
    // graphe) quand le run en avait mesuré 16. Deux chemins, deux réponses.
    const measured = graph({
      coverage: { discovered: 2241, deterministicClassified: 2103, llmEnriched: 613, enrichmentBatchSize: 50 },
    })
    const view = buildFocalOrgView(measured, 'e-ds', { discovered: 2241 })!
    expect(view.coverage.llmEnriched).toBe(613)
    expect(view.coverage.remainingEnrichment).toBe(2241 - 613)
  })

  it('un graphe qui n’a rien mesuré ne fait pas passer sa vague pour une couverture', () => {
    // Deux personnes de ce graphe sont `actionable` : les compter écrirait
    // « 2 enrichis » sur un dossier dont aucune vague n'a été mesurée.
    const view = buildFocalOrgView(graph(), 'e-ds', { discovered: 2241 })!
    expect(view.coverage.llmEnriched).toBeNull()
    expect(view.coverage.deterministicClassified).toBeNull()
  })

  it('une direction inconnue retombe sur la direction par défaut plutôt que sur un écran vide', () => {
    expect(buildFocalOrgView(graph(), 'e-inexistante')!.direction.id).toBe('e-ds')
  })

  it('un graphe sans personne rattachée ne produit pas de vue focale', () => {
    const empty = graph({
      people: [],
      hierarchyEdges: [],
      buyingCommittee: [],
      recommendedPath: [],
      uncoveredZones: [],
    })
    expect(buildFocalOrgView(empty, null)).toBeNull()
  })

  it('les contacts de la direction sont triés par niveau puis par confiance', () => {
    const view = buildFocalOrgView(graph(), 'e-ds')!
    expect(view.contacts.slice(0, 2).map(p => p.id)).toEqual(['p-schoellhorn', 'p-werner'])
  })

  /**
   * #2121.15 / #2121.54 — le tableau du bas montre les contacts UTILES en
   * premier, dans le MÊME ordre que `useContactRanking` (l'onglet Contacts) —
   * jamais un second calcul d'utilité (GA-26).
   */
  it('un contact classé UTILE passe devant, même sans niveau ni confiance', () => {
    // p-martin n'a AUCUN niveau : sans classement, il est toujours dernier.
    const view = buildFocalOrgView(graph(), 'e-ds', { topContactIds: ['p-martin'] })!
    expect(view.contacts[0]?.id).toBe('p-martin')
    // Le reste garde EXACTEMENT l'ordre d'avant ce point — un classement
    // PARTIEL ne redistribue que ce qu'il connaît.
    const before = buildFocalOrgView(graph(), 'e-ds')!.contacts.filter(p => p.id !== 'p-martin')
    expect(view.contacts.slice(1).map(p => p.id)).toEqual(before.map(p => p.id))
  })

  it('sans classement (compte pas encore classé), le tri reste EXACTEMENT celui d’avant ce point', () => {
    const withEmptyRanking = buildFocalOrgView(graph(), 'e-ds', { topContactIds: [] })!.contacts.map(p => p.id)
    const withoutOption = buildFocalOrgView(graph(), 'e-ds')!.contacts.map(p => p.id)
    expect(withEmptyRanking).toEqual(withoutOption)
  })
})

// #4072.1 — l'organigramme sait qui l'espace connaît déjà.
describe('buildFocalOrgView — personnes déjà connues de l’espace (#4072.1)', () => {
  const two = () =>
    graph({
      hierarchyEdges: [],
      recommendedPath: [],
      buyingCommittee: [],
      edges: [],
      people: [
        person({
          id: 'p-a',
          fullName: 'Alice A',
          title: 'Directrice',
          entityId: 'e-ds',
          hierarchyLevel: 'L2',
          confidence: 90,
        }),
        person({
          id: 'p-b',
          fullName: 'Bruno B',
          title: 'Directeur',
          entityId: 'e-ds',
          hierarchyLevel: 'L2',
          confidence: 50,
        }),
      ],
    })
  const known = new Map([['p-b', { reasons: ['crm', 'mission'] as const, lastDate: '2025-03-01' }]])

  it('marque la personne connue et la passe devant, DANS son niveau (le niveau reste la géométrie)', () => {
    const view = buildFocalOrgView(two(), 'e-ds', { knownByPersonId: known })!
    const l2 = view.levelRows.find(level => level.level === 'L2')!.people
    expect(l2.map(p => p.id)).toEqual(['p-b', 'p-a'])
    expect(l2[0]?.known).toEqual({ reasons: ['crm', 'mission'], lastDate: '2025-03-01' })
    expect(l2[1]?.known).toBeNull()
  })

  it('sans personne connue, l’ordre est EXACTEMENT celui d’avant ce point', () => {
    const before = buildFocalOrgView(two(), 'e-ds')!
      .levelRows.find(l => l.level === 'L2')!
      .people.map(p => p.id)
    const empty = buildFocalOrgView(two(), 'e-ds', { knownByPersonId: new Map() })!
      .levelRows.find(l => l.level === 'L2')!
      .people.map(p => p.id)
    expect(before).toEqual(['p-a', 'p-b'])
    expect(empty).toEqual(before)
  })

  it('une personne connue d’un niveau inférieur ne passe jamais devant le niveau supérieur', () => {
    const g = graph({
      hierarchyEdges: [],
      recommendedPath: [],
      buyingCommittee: [],
      edges: [],
      people: [
        person({ id: 'p-a', fullName: 'Alice A', entityId: 'e-ds', hierarchyLevel: 'L1', confidence: 60 }),
        person({ id: 'p-b', fullName: 'Bruno B', entityId: 'e-ds', hierarchyLevel: 'L3', confidence: 60 }),
      ],
    })
    const view = buildFocalOrgView(g, 'e-ds', { knownByPersonId: known })!
    expect(view.contacts.map(p => p.id)).toEqual(['p-a', 'p-b'])
  })
})

/* ------------------------------------------------------------------ */
/*  La règle des 60 % — plancher sur le GÉNÉRATEUR                    */
/* ------------------------------------------------------------------ */

describe('measureGeneratorColouring — le plancher de gris', () => {
  it('mesure les NŒUDS non enrichis, pas les arêtes', () => {
    // Cinq personnes non enrichies (deux sont `actionable`). Grises = celles
    // qu'aucun rôle de décision ne colore : Dupont (Opérationnel) et Martin
    // (aucun badge). Perrin (Bloqueur), Klein et Bernard (Achats → Influenceur)
    // sont colorées.
    const measure = measureGeneratorColouring(graph())!
    expect(measure.unenriched).toBe(5)
    expect(measure.grey).toBe(2)
    expect(measure.share).toBeCloseTo(0.4, 5)
    expect(measure.meetsFloor).toBe(false)
  })

  it('est GRIS le nœud dont aucun rôle de décision n’est affirmé — le badge d’écran n’y entre pas', () => {
    const g = graph({
      people: [
        person({ id: 'a', fullName: 'A', hierarchyLevel: 'L3' }),
        person({ id: 'b', fullName: 'B' }),
        person({ id: 'c', fullName: 'C', decisionRoles: ['economic_buyer'] }),
      ],
      hierarchyEdges: [],
      buyingCommittee: [],
      recommendedPath: [],
      uncoveredZones: [],
    })
    const measure = measureGeneratorColouring(g)!
    expect(measure.grey).toBe(2)
    expect(measure.unenriched).toBe(3)
    expect(measure.meetsFloor).toBe(true) // 2/3 = 66,7 % ≥ 60 %
  })

  it('un graphe entièrement enrichi ne se mesure pas — et « 0 % » serait faux', () => {
    const g = graph({
      people: [person({ id: 'a', fullName: 'A', identityStatus: 'actionable', decisionRoles: ['economic_buyer'] })],
      hierarchyEdges: [],
      buyingCommittee: [],
      recommendedPath: [],
      uncoveredZones: [],
    })
    expect(measureGeneratorColouring(g)).toBeNull()
  })

  it('un graphe sans personne ne se mesure pas', () => {
    const empty = graph({
      people: [],
      hierarchyEdges: [],
      buyingCommittee: [],
      recommendedPath: [],
      uncoveredZones: [],
    })
    expect(measureGeneratorColouring(empty)).toBeNull()
  })
})

/* ------------------------------------------------------------------ */
/*  Le graphe PORTE sa mesure : l'écran la lit, il ne la refait pas    */
/* ------------------------------------------------------------------ */

describe('measureGeneratorColouring — la mesure vient du GÉNÉRATEUR', () => {
  it('lit le bloc que le graphe transporte, plutôt que de recompter', () => {
    // Le générateur a mesuré 8 personnes non enrichies dont 6 grises. Les nœuds
    // portés par ce graphe de test ne disent PAS la même chose : si le lecteur
    // recomptait, il annoncerait un autre chiffre — et c'est exactement comme ça
    // que `MOSTLY_INFERRED_RATIO` s'est mis à compter des arêtes.
    const g = graph({ colouring: { unenriched: 8, grey: 6, floor: 0.6 } })
    const measure = measureGeneratorColouring(g)!
    expect(measure.unenriched).toBe(8)
    expect(measure.grey).toBe(6)
    expect(measure.share).toBeCloseTo(0.75, 5)
    expect(measure.meetsFloor).toBe(true)
  })

  it('affiche le plancher que le graphe transporte, pas une copie locale', () => {
    const g = graph({ colouring: { unenriched: 10, grey: 7, floor: 0.8 } })
    const measure = measureGeneratorColouring(g)!
    expect(measure.floor).toBe(0.8)
    expect(measure.meetsFloor).toBe(false) // 70 % < 80 %
  })

  it('retombe sur le calcul local pour un dossier antérieur au chantier', () => {
    // Le repli applique la MÊME définition : sans lui, un dossier ancien
    // n'afficherait rien du tout là où il a le plus besoin d'être lu.
    const measure = measureGeneratorColouring(graph())!
    expect(measure.floor).toBe(0.6)
    expect(measure.unenriched).toBe(5)
  })

  /* ---------------------------------------------------------------- */
  /*  « je n'ai pas pu mesurer » ≠ « j'ai mesuré, et c'est zéro »      */
  /* ---------------------------------------------------------------- */

  /**
   * D266/D267, mesuré en production sur le dossier ROCHE : le bandeau annonçait
   *
   *   « sur les 35 personnes que l'analyse n'a pas enrichies, seules 0 %
   *     ne portent aucun rôle de décision, alors que le plancher est de 60 % »
   *
   * Ce « 0 % » n'était pas une mesure : c'était le repli qui appliquait la
   * définition NEUVE du gris — « aucun rôle autre que `unknown` » — à un graphe
   * écrit par le générateur d'AVANT, dont le vocabulaire ne contenait pas
   * `unknown`. Un générateur qui ne peut pas dire « je ne sais pas » produit
   * mécaniquement zéro nœud gris ; en conclure qu'il a tout colorié sans preuve
   * est un verdict tiré d'un silence.
   *
   * La sortie honnête est donc « je n'ai pas pu mesurer », MUETTE — et elle doit
   * rester distincte de « j'ai mesuré, et c'est sous le plancher », qui alerte.
   */
  it('un graphe qui ne SAIT PAS dire « je ne sais pas » ne se voit pas attribuer 0 % de gris', () => {
    const ancien = graph({
      people: [
        person({ id: 'a', fullName: 'A', decisionRoles: ['champion'] }),
        person({ id: 'b', fullName: 'B', decisionRoles: ['technical_buyer'] }),
        person({ id: 'c', fullName: 'C', decisionRoles: ['user_buyer'] }),
      ],
      hierarchyEdges: [],
      buyingCommittee: [],
      recommendedPath: [],
      uncoveredZones: [],
    })
    const measure = measureGeneratorColouring(ancien)!
    expect(measure.unenriched).toBe(3)
    // Ni « 0 gris », ni « 0 % », ni un verdict : les trois seraient des
    // affirmations tirées d'une absence de vocabulaire.
    expect(measure.grey).toBeNull()
    expect(measure.share).toBeNull()
    expect(measure.meetsFloor).toBeNull()
  })

  it('un graphe qui sait dire « je ne sais pas » est mesuré, même quand il est SOUS le plancher', () => {
    // Le contrepoint indispensable : si l'on désarmait l'avertissement pour
    // faire taire le faux positif, on perdrait le vrai. Ici un seul nœud est
    // gris sur quatre — 25 %, sous le plancher — et ça DOIT alerter.
    const colorie = graph({
      people: [
        person({ id: 'a', fullName: 'A', decisionRoles: ['unknown'] }),
        person({ id: 'b', fullName: 'B', decisionRoles: ['champion'] }),
        person({ id: 'c', fullName: 'C', decisionRoles: ['technical_buyer'] }),
        person({ id: 'd', fullName: 'D', decisionRoles: ['user_buyer'] }),
      ],
      hierarchyEdges: [],
      buyingCommittee: [],
      recommendedPath: [],
      uncoveredZones: [],
    })
    const measure = measureGeneratorColouring(colorie)!
    expect(measure.grey).toBe(1)
    expect(measure.share).toBeCloseTo(0.25, 5)
    expect(measure.meetsFloor).toBe(false)
  })

  it('la mesure du GÉNÉRATEUR reste souveraine — elle n’a pas besoin du vocabulaire du graphe', () => {
    // Le générateur a compté 0 gris sur 10 : LUI a pu mesurer, et son verdict
    // s'impose. Le repli n'est un repli que faute de mesure.
    const g = graph({
      colouring: { unenriched: 10, grey: 0, floor: 0.6 },
      people: [person({ id: 'a', fullName: 'A', decisionRoles: ['champion'] })],
      hierarchyEdges: [],
      buyingCommittee: [],
      recommendedPath: [],
      uncoveredZones: [],
    })
    const measure = measureGeneratorColouring(g)!
    expect(measure.grey).toBe(0)
    expect(measure.share).toBe(0)
    expect(measure.meetsFloor).toBe(false)
  })
})

/* ------------------------------------------------------------------ */
/*  `unknown` est un rôle NOMMÉ, pas un rôle discret                   */
/* ------------------------------------------------------------------ */

describe('decisionBadgeOf — le rôle inconnu ne devient pas « Opérationnel »', () => {
  const ctx = { committee: new Set<string>(), sponsors: new Set<string>() }

  it('rend `null` — « je ne sais pas » n’est pas « pas d’autorité connue »', () => {
    const unknown = person({ id: 'p-x', fullName: 'X', decisionRoles: ['unknown' as const] }) as never
    expect(decisionBadgeOf(unknown, ctx)).toBeNull()
  })

  it('…y compris quand la personne est située en L3/L4', () => {
    const unknown = person({
      id: 'p-y',
      fullName: 'Y',
      hierarchyLevel: 'L4' as const,
      decisionRoles: ['unknown' as const],
    }) as never
    expect(decisionBadgeOf(unknown, ctx)).toBeNull()
  })

  it('un niveau opérationnel SANS rôle du tout reste « Opérationnel »', () => {
    const bare = person({ id: 'p-z', fullName: 'Z', hierarchyLevel: 'L4' as const }) as never
    expect(decisionBadgeOf(bare, ctx)).toBe('operational')
  })
})

/* ------------------------------------------------------------------ */
/*  Le badge « déduit » (T5.md:804-813)                                */
/* ------------------------------------------------------------------ */

describe('buildFocalOrgView — un rôle déduit le DIT', () => {
  function withRoles(roleInferred: boolean | undefined) {
    return graph({
      people: [
        person({
          id: 'p-a',
          fullName: 'A',
          entityId: 'e-eng',
          hierarchyLevel: 'L2',
          decisionRoles: ['economic_buyer'],
          ...(roleInferred === undefined ? {} : { roleInferred }),
        }),
      ],
      hierarchyEdges: [],
      buyingCommittee: [],
      recommendedPath: [],
      uncoveredZones: [],
    })
  }

  it('marque la carte quand le rôle vient d’une règle lue sur le titre', () => {
    const view = buildFocalOrgView(withRoles(true), 'e-eng')!
    expect(view.contacts[0]?.roleInferred).toBe(true)
  })

  it('ne la marque pas quand quelqu’un l’a déclaré — une correction humaine gagne', () => {
    const view = buildFocalOrgView(withRoles(false), 'e-eng')!
    expect(view.contacts[0]?.roleInferred).toBe(false)
  })

  it('ne marque jamais un nœud gris : il n’y a pas de rôle à qualifier', () => {
    const g = graph({
      people: [person({ id: 'p-a', fullName: 'A', entityId: 'e-eng', decisionRoles: ['unknown'] })],
      hierarchyEdges: [],
      buyingCommittee: [],
      recommendedPath: [],
      uncoveredZones: [],
    })
    const view = buildFocalOrgView(g, 'e-eng')!
    expect(view.contacts[0]?.badge).toBeNull()
    expect(view.contacts[0]?.roleInferred).toBe(false)
  })
})

/* ------------------------------------------------------------------ */
/*  Quatre entités maximum, « + N autres » (T5.md:1051)                */
/* ------------------------------------------------------------------ */

describe('buildFocalOrgView — le groupe à 1 000 filiales', () => {
  /**
   * Un groupe à `count` directions. Les cinq premières sont les plus peuplées
   * (5, 4, 3, 2 puis 1 personne), les autres en portent une chacune : l'ordre
   * « les mieux scorées » est donc e-0, e-1, e-2, e-3 — et il ne dépend pas du
   * hasard d'un tri alphabétique.
   */
  function bigGroup(count: number): OrgGraph {
    const headcount = (i: number) => Math.max(1, 5 - i)
    return graph({
      entities: Array.from({ length: count }, (_, i) => ({
        id: `e-${i}`,
        name: `Direction ${String(i).padStart(4, '0')}`,
        type: 'bu' as const,
        parentId: null,
        confidence: 70,
        sources: [],
      })),
      people: Array.from({ length: count }, (_, i) =>
        Array.from({ length: headcount(i) }, (_, j) =>
          person({ id: `p-${i}-${j}`, fullName: `P${i}-${j}`, entityId: `e-${i}` }),
        ),
      ).flat(),
      hierarchyEdges: [],
      buyingCommittee: [],
      recommendedPath: [],
      uncoveredZones: [],
    })
  }

  it('n’en montre que QUATRE, les mieux scorées', () => {
    const view = buildFocalOrgView(bigGroup(1000), 'e-0')!
    expect(view.topDirections).toHaveLength(4)
    expect(view.topDirections.map(d => d.id)).toEqual(['e-0', 'e-1', 'e-2', 'e-3'])
  })

  it('« + 996 autres » est un COMPTE, donc EXACT', () => {
    const view = buildFocalOrgView(bigGroup(1000), 'e-0')!
    expect(view.hiddenDirections).toBe(996)
    expect(view.topDirections.length + view.hiddenDirections).toBe(view.directions.length)
  })

  it('garde un chemin vers les autres : le sélecteur reste exhaustif', () => {
    const view = buildFocalOrgView(bigGroup(1000), 'e-0')!
    expect(view.directions).toHaveLength(1000)
  })

  it('la direction OUVERTE est toujours dans la rangée, même hors du top 4', () => {
    const view = buildFocalOrgView(bigGroup(1000), 'e-900')!
    expect(view.topDirections.map(d => d.id)).toContain('e-900')
    expect(view.topDirections).toHaveLength(4)
    expect(view.hiddenDirections).toBe(996)
  })

  it('ne compte rien de caché quand le compte a quatre directions ou moins', () => {
    const view = buildFocalOrgView(bigGroup(3), 'e-0')!
    expect(view.topDirections).toHaveLength(3)
    expect(view.hiddenDirections).toBe(0)
  })
})

/* ------------------------------------------------------------------ */
/*  Les trois vues commutables du 31/08/2026                           */
/* ------------------------------------------------------------------ */

describe('la carte porte les rôles BRUTS du contrat', () => {
  it('les rôles voyagent tels quels — aucun second vocabulaire n’est créé', () => {
    const view = buildFocalOrgView(graph(), 'e-eng')!
    expect(view.contacts.find(card => card.id === 'p-werner')?.roles).toEqual(['champion', 'technical_buyer'])
  })

  it('une personne sans rôle porte une liste VIDE, jamais un rôle de remplissage', () => {
    const view = buildFocalOrgView(graph(), 'e-eng')!
    expect(view.contacts.find(card => card.id === 'p-dupont')?.roles).toEqual([])
  })
})

describe('un rattachement DIT d’où vient son trait', () => {
  it('vérifié ET sourcé : le trait est « sourced » — trait plein', () => {
    const werner = buildFocalOrgView(graph(), 'e-eng')!.contacts.find(card => card.id === 'p-werner')
    expect(werner?.reporting?.linkOrigin).toBe('sourced')
    expect(werner?.reporting?.verified).toBe(true)
  })

  it('non vérifié : le trait est « assumed » — pointillé', () => {
    const view = buildFocalOrgView(graph(), 'e-eng')!
    expect(view.contacts.find(card => card.id === 'p-dupont')?.reporting?.linkOrigin).toBe('assumed')
  })

  it('vérifié mais dont la PREUVE est introuvable : « assumed », jamais « sourced »', () => {
    // Le graphe déclare le lien vérifié et cite un `sourceId` — mais aucun nœud
    // ne porte cette source. Afficher un trait plein reviendrait à montrer une
    // provenance fabriquée : c'est exactement ce que `orgLinkOrigin` refuse.
    const orphan = graph({
      hierarchyEdges: [
        {
          fromId: 'p-werner',
          toId: 'p-schoellhorn',
          type: 'reports_to',
          sourceIds: ['s-introuvable'],
          confidence: 95,
          verified: true,
        },
      ],
    })
    const view = buildFocalOrgView(orphan, 'e-eng')!
    expect(view.contacts.find(card => card.id === 'p-werner')?.reporting?.linkOrigin).toBe('assumed')
  })
})

describe('buildOrgGroupView — la structure du groupe', () => {
  it('rend l’arbre des entités, racine d’abord, avec sa profondeur', () => {
    const view = buildOrgGroupView(graph())!
    expect(view.nodes.map(node => node.id)).toEqual(['e-grp', 'e-ds', 'e-eng'])
    expect(view.nodes.map(node => node.depth)).toEqual([0, 1, 2])
    expect(view.nodes[0]?.parentId).toBeNull()
  })

  it('distingue le sous-arbre du rattachement DIRECT', () => {
    const group = buildOrgGroupView(graph())!.nodes.find(node => node.id === 'e-grp')
    // Personne n'est rattaché DIRECTEMENT au groupe ; sept le sont à ses filles.
    expect(group?.directPeopleCount).toBe(0)
    expect(group?.peopleCount).toBe(7)
    expect(group?.hasChildren).toBe(true)
  })

  it('le trait vers le parent est une STRUCTURE, jamais un rattachement prouvé', () => {
    const view = buildOrgGroupView(graph())!
    expect(view.nodes.find(node => node.id === 'e-grp')?.linkOrigin).toBeNull()
    expect(view.nodes.find(node => node.id === 'e-ds')?.linkOrigin).toBe('structure')
  })

  it('la couverture vient du contrat, elle n’est pas recomptée ici', () => {
    const view = buildOrgGroupView(graph(), { discovered: 2241 })!
    expect(view.coverage.discovered).toBe(2241)
    // Le trou NOMMÉ du contrat reste un trou : le rattachement n'est pas mesuré.
    expect(view.coverage.attachedToEntity).toBeNull()
  })

  it('une part non mesurable rend `null`, jamais 0', () => {
    // `attachedToEntity` est inconnu ⇒ la part l'est aussi. « 0 % rattachés »
    // serait faux : ce n'est pas qu'aucun ne l'est, c'est qu'on ne le mesure pas.
    expect(buildOrgGroupView(graph(), { discovered: 2241 })!.quality.attachedShare).toBeNull()
  })

  it('une part MESURABLE se mesure — et 0 y serait vrai', () => {
    const view = buildOrgGroupView(graph())!
    // Six personnes sur sept portent un niveau ; Paul Martin n'en a pas.
    expect(view.quality.people).toBe(7)
    expect(view.quality.leveled).toBe(6)
    expect(view.quality.leveledShare).toBeCloseTo(6 / 7)
  })

  it('compte les personnes qu’AUCUNE entité ne porte', () => {
    const orphan = graph({
      people: [
        person({ id: 'p-seul', fullName: 'Alex Orphelin', hierarchyLevel: 'L2' }),
        person({ id: 'p-ds', fullName: 'Marie Rattachée', entityId: 'e-ds', hierarchyLevel: 'L1' }),
      ],
      hierarchyEdges: [],
      buyingCommittee: [],
      recommendedPath: [],
    })
    expect(buildOrgGroupView(orphan)!.unattachedPeople).toBe(1)
  })

  it('sans entité, il n’y a pas de groupe — `null`, jamais un groupe fictif', () => {
    const flat = graph({
      entities: [],
      people: [],
      hierarchyEdges: [],
      buyingCommittee: [],
      recommendedPath: [],
      uncoveredZones: [],
    })
    expect(buildOrgGroupView(flat)).toBeNull()
  })

  it('une entité sans parent est une RACINE, et elle est la première lue', () => {
    // Un `parentId` PENDANT ne peut pas arriver ici : `orgGraphSchema` le refuse
    // (« parentId "e-absent" is not in entities[] »). Le repli qui en ferait une
    // racine existe quand même dans la dérivation — mais il ne se teste pas avec
    // un graphe valide, et on n'en fabrique pas un faux pour se donner raison.
    const flat = graph({
      entities: [{ id: 'e-x', name: 'Direction X', type: 'bu', parentId: null, confidence: 70, sources: [] }],
      people: [person({ id: 'p-x', fullName: 'Zoé Test', entityId: 'e-x', hierarchyLevel: 'L2' })],
      hierarchyEdges: [],
      buyingCommittee: [],
      recommendedPath: [],
      uncoveredZones: [],
    })
    const view = buildOrgGroupView(flat)!
    expect(view.nodes.map(node => node.id)).toEqual(['e-x'])
    expect(view.nodes[0]?.depth).toBe(0)
    expect(view.nodes[0]?.linkOrigin).toBeNull()
  })

  it('un cycle parent/enfant ne boucle pas', () => {
    const cyclic = graph({
      entities: [
        { id: 'e-a', name: 'A', type: 'bu', parentId: 'e-b', confidence: 70, sources: [] },
        { id: 'e-b', name: 'B', type: 'bu', parentId: 'e-a', confidence: 70, sources: [] },
      ],
      people: [person({ id: 'p-a', fullName: 'Ana Boucle', entityId: 'e-a', hierarchyLevel: 'L2' })],
      hierarchyEdges: [],
      buyingCommittee: [],
      recommendedPath: [],
      uncoveredZones: [],
    })
    expect(buildOrgGroupView(cyclic)!.nodes).toHaveLength(2)
  })
})

/* ------------------------------------------------------------------ */
/*  #2512 — les non-enrichis, par défaut                               */
/* ------------------------------------------------------------------ */

/**
 * #2512 — Louis, en recette : « par défaut, mettre aussi les gens NON
 * ENRICHIS dans l'organigramme ». `graph.people` ne porte que la vague
 * d'enrichissement (bornée) : un contact découvert mais jamais enrichi n'a
 * AUCUN nœud `OrgPerson` — il n'était donc nulle part sur l'écran, quel que
 * soit son niveau de profondeur. Cette suite tient trois choses :
 *  1. un contact déjà dans le graphe (même personne) ne se DOUBLE pas ;
 *  2. rien n'est deviné pour les non-enrichis — pas de niveau, pas de rôle ;
 *  3. le rapprochement se fait sur le NOM NORMALISÉ (accents/casse), comme
 *     l'assembleur IA — jamais un id, que les deux mondes ne partagent pas.
 */
describe('unenrichedOrgContacts', () => {
  const base = graph({
    people: [person({ id: 'p-schoellhorn', fullName: 'M. Schoellhorn', entityId: 'e-ds', hierarchyLevel: 'L1' })],
    hierarchyEdges: [],
    buyingCommittee: [],
    recommendedPath: [],
    uncoveredZones: [],
  })

  it('ajoute un contact découvert mais jamais enrichi — absent du graphe', () => {
    const out = unenrichedOrgContacts(base, [{ id: 'c-1', full_name: 'Léa Nouvelle', title: 'Chargée de compte' }])
    expect(out).toEqual([{ id: 'c-1', fullName: 'Léa Nouvelle', title: 'Chargée de compte' }])
  })

  it('ne double PAS une personne déjà dans le graphe — rapprochée par nom normalisé', () => {
    const out = unenrichedOrgContacts(base, [
      // Accents et casse différents de `graph.people` — même personne.
      { id: 'c-2', full_name: 'M. SCHOELLHORN', title: 'CEO' },
    ])
    expect(out).toEqual([])
  })

  it('un titre absent reste absent — jamais inventé', () => {
    const out = unenrichedOrgContacts(base, [{ id: 'c-3', full_name: 'Léa Nouvelle', title: null }])
    expect(out).toEqual([{ id: 'c-3', fullName: 'Léa Nouvelle', title: null }])
  })

  it('un nom vide ne produit aucune carte fantôme', () => {
    expect(unenrichedOrgContacts(base, [{ id: 'c-4', full_name: '   ', title: null }])).toEqual([])
  })

  /**
   * #2512, la part moteur (IA) — `org_graph_assembler.py` fait désormais entrer
   * les contacts découverts non enrichis dans `graph.people` (nœud
   * `identityStatus: 'seed'`, niveau L0-L4 déduit du titre ou ABSENT). Ce test
   * tient la jointure : une fois que l'assembleur les porte, `unenrichedOrgContacts`
   * ne doit pas les afficher une SECONDE fois — le rapprochement par nom
   * normalisé (déjà éprouvé ci-dessus) doit valoir aussi pour un nœud `seed`
   * SANS niveau, pas seulement pour un nœud pleinement classifié.
   */
  it('un nœud `seed` sans niveau (contact découvert déjà porté par le graphe) ne double pas non plus', () => {
    const withSeed = graph({
      people: [
        person({ id: 'p-schoellhorn', fullName: 'M. Schoellhorn', entityId: 'e-ds', hierarchyLevel: 'L1' }),
        // Un découvert que l'assembleur a déjà ajouté : identityStatus `seed`,
        // AUCUN hierarchyLevel (intitulé absent ou illisible côté IA).
        person({ id: 'p-graine', fullName: 'Léa Nouvelle', identityStatus: 'seed', entityId: null }),
      ],
      hierarchyEdges: [],
      buyingCommittee: [],
      recommendedPath: [],
      uncoveredZones: [],
    })
    const out = unenrichedOrgContacts(withSeed, [{ id: 'c-5', full_name: 'Léa Nouvelle', title: 'Chargée de compte' }])
    expect(out).toEqual([])
  })
})

describe('#2553.3 — la carte porte la date de vérification du graphe', () => {
  it('transporte `lastVerifiedAt` tel quel — la carte, pas le read-model, décide de la fraîcheur', () => {
    const withVerified = graph({
      people: [
        person({
          id: 'p-schoellhorn',
          fullName: 'M. Schoellhorn',
          entityId: 'e-ds',
          hierarchyLevel: 'L1',
          lastVerifiedAt: '2023-06-01',
        }),
      ],
      hierarchyEdges: [],
      buyingCommittee: [],
      recommendedPath: [],
      uncoveredZones: [],
    })

    const view = buildFocalOrgView(withVerified, 'e-ds')!
    const card = view.levelRows.flatMap(r => r.people).find(p => p.id === 'p-schoellhorn')!
    expect(card.lastVerifiedAt).toBe('2023-06-01')
  })

  it('sans vérification connue, la carte porte `null` — jamais une date inventée', () => {
    const view = buildFocalOrgView(graph(), 'e-ds')!
    const card = view.levelRows.flatMap(r => r.people).find(p => p.id === 'p-schoellhorn')!
    expect(card.lastVerifiedAt).toBeNull()
  })
})

describe('#2837 — orgRootEntityIds, la même notion de racine que buildOrgGroupView', () => {
  it('ne retient que le groupe — AIRBUS DS et Engineering ont un parent trouvable', () => {
    expect(orgRootEntityIds(graph())).toEqual(new Set(['e-grp']))
  })

  it('deux groupes indépendants (`parentId: null` chacun) sont deux racines', () => {
    const twoGroups = graph({
      entities: [
        { id: 'e-grp', name: 'AIRBUS SE', type: 'groupe', parentId: null, confidence: 95, sources: [SOURCE] },
        { id: 'e-grp2', name: 'THALES SA', type: 'groupe', parentId: null, confidence: 90, sources: [] },
      ],
      people: [],
      hierarchyEdges: [],
      buyingCommittee: [],
      recommendedPath: [],
      uncoveredZones: [],
    })
    expect(orgRootEntityIds(twoGroups)).toEqual(new Set(['e-grp', 'e-grp2']))
  })

  it('un cycle pur (A parent de B, B parent de A) n’a AUCUNE racine — ni l’une ni l’autre n’est masquée', () => {
    const withCycle = graph({
      entities: [
        { id: 'e-a', name: 'A', type: 'filiale', parentId: 'e-b', confidence: 50, sources: [] },
        { id: 'e-b', name: 'B', type: 'filiale', parentId: 'e-a', confidence: 50, sources: [] },
      ],
      people: [],
      hierarchyEdges: [],
      buyingCommittee: [],
      recommendedPath: [],
      uncoveredZones: [],
    })
    expect(orgRootEntityIds(withCycle)).toEqual(new Set())
  })
})

describe('#3423.7 — une seule source de vérité pour le rôle d’une personne (carte = fiche)', () => {
  const g = graph()
  const technical = g.people.find(p => p.decisionRoles.includes('technical_buyer'))!

  it('un décideur technique est « technical » sur la carte, comme sur la fiche — pas « influencer »', () => {
    const view = buildFocalOrgView(g, 'e-ds')!
    const card = view.contacts.find(c => c.id === technical.id)!
    expect(card.decisionRole).toBe('technical')
    // Le badge commercial reste calculé, mais distinct : la carte le nomme « Rôle dans la vente ».
    expect(card.badge).toBe('influencer')
  })

  it('une correction humaine de la fiche gagne sur le graphe', () => {
    const view = buildFocalOrgView(g, 'e-ds', { contactRoleByPersonId: new Map([[technical.id, 'economic']]) })!
    const card = view.contacts.find(c => c.id === technical.id)!
    expect(card.decisionRole).toBe('economic')
  })

  it('rien d’établi → aucun rôle (jamais « Inconnu »)', () => {
    expect(personDecisionRole([], null)).toBeNull()
    expect(personDecisionRole(['unknown'], 'unknown')).toBeNull()
  })
})
