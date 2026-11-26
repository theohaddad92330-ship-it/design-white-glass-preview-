import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ORG_RELATION_CLAIM_BACKING,
  ORG_REPORTING_INFLUENCE_TOPIC,
  orgGraphSchema,
  orgInferredReportings,
  type OrgGraph,
  type OrgSource,
} from '@bellum/contracts'
import { applyRelationVerdict } from './org-graph-verify'

/**
 * GA-127 — PROMOUVOIR UNE HYPOTHÈSE EXIGE UNE PREUVE QUI A OBSERVÉ LE LIEN.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE, ET POURQUOI ELLE A BESOIN D'UNE SECONDE PORTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Décision n°6 du chantier OrgGraph, fermée le 29/08 : **une preuve d'IDENTITÉ
 * ne prouve jamais une RELATION.** Le fournisseur qui établit que Marie Martin
 * existe n'a jamais observé à qui elle rapporte.
 *
 * Cette règle est devenue un MÉCANISME côté Python — `_honour_claims` +
 * `_CLAIMS_BACKING` dans `org_graph_assembler.py` (GA-98 / GA-99). Elle ne
 * l'était PAS côté TypeScript : `applyRelationVerdict` est le seul chemin
 * d'écriture d'un lien hiérarchique de l'API, et il ne lisait aucun claim. Tant
 * qu'il se contentait de mettre à jour un lien EXISTANT, la question ne se
 * posait pas — l'assembleur avait déjà filtré. Depuis D360 il en CRÉE un
 * (promotion d'une hypothèse de rattachement), et c'est un chemin neuf : il
 * pouvait rouvrir le P0 sans faire rougir aucune garde, puisque aucune garde ne
 * regardait par là.
 *
 * « Une porte unique écrite dans un seul langage n'est pas une porte. »
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE PROUVE, ET COMMENT ELLE SAIT DIRE NON
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. elle LIT — la table Python existe, elle n'est pas vide, et la table
 *     TypeScript en est le miroir EXACT (relation par relation, claim par
 *     claim). Deux tables recopiées à la main divergent ;
 *  2. une preuve de claim `identity` NE PROMEUT PAS. C'est le P0 lui-même,
 *     rejoué par le chemin neuf ;
 *  3. une preuve SANS claim déclaré ne promeut pas non plus quand elle ne vient
 *     pas du vérificateur (GA-99 : on ne sait pas ce qu'elle prouve) ;
 *  4. une preuve qui a observé le lien promeut, et la ligne créée cite CETTE
 *     preuve-là — pas les preuves d'identité qui traînaient sur le nœud.
 */

const IA_ASSEMBLER = join(__dirname, '..', '..', '..', '..', 'ia', 'app', 'services', 'org_graph_assembler.py')

/** Un dossier tel que l'assembleur le produit depuis le correctif P0 : aucun
 *  `reports_to`, le rattachement rangé en influence. */
function graphWithHypothesis(): OrgGraph {
  return orgGraphSchema.parse({
    graphVersion: 4,
    entities: [{ id: 'e-tf1', name: 'TF1 Groupe', type: 'groupe', parentId: null, confidence: 90, sources: [] }],
    people: [
      {
        id: 'p-jean',
        fullName: 'Jean Dupont',
        title: 'DSI',
        entityId: 'e-tf1',
        identityStatus: 'classified',
        confidence: 60,
        sources: [{ id: 's-apollo-jean', kind: 'linkedin', grounding: 'B', claim: 'identity' }],
      },
      {
        id: 'p-marie',
        fullName: 'Marie Martin',
        title: 'Responsable Data',
        entityId: 'e-tf1',
        identityStatus: 'classified',
        confidence: 55,
        sources: [{ id: 's-apollo-marie', kind: 'linkedin', grounding: 'B', claim: 'identity' }],
      },
    ],
    hierarchyEdges: [
      {
        fromId: 'p-marie',
        toId: 'e-tf1',
        type: 'member_of',
        sourceIds: ['s-apollo-marie'],
        confidence: 55,
        verified: false,
      },
    ],
    influenceEdges: [
      {
        fromId: 'p-marie',
        toId: 'p-jean',
        topic: ORG_REPORTING_INFLUENCE_TOPIC,
        stance: 'unknown',
        confidence: 15,
        reasoning: 'N+1 supposé par le modèle à partir du poste — aucune source n’a observé ce rattachement.',
      },
    ],
  })
}

const OFFICIAL: OrgSource = {
  id: 's-verify-0',
  kind: 'official_site',
  ref: 'https://tf1.fr/gouvernance',
  grounding: 'A',
  date: '2026-08-30',
}

const promote = (sources: OrgSource[], confidence = 92, verified = true) =>
  applyRelationVerdict(graphWithHypothesis(), {
    fromId: 'p-marie',
    toId: 'p-jean',
    type: 'reports_to',
    version: 5,
    at: '2026-08-31T09:00:00.000Z',
    verdict: { verified, confidence, sources },
  })

describe('GA-127 — la promotion d’une hypothèse passe par le claim', () => {
  it('LIT quelque chose — la table Python existe et n’est pas vide', () => {
    // Sans ceci, un chemin faux rendrait la comparaison verte sur zéro octet.
    const python = readFileSync(IA_ASSEMBLER, 'utf8')
    expect(python.length).toBeGreaterThan(1000)
    expect(python).toContain('_CLAIMS_BACKING')
  })

  it('la table TypeScript est le MIROIR EXACT de `_CLAIMS_BACKING`', () => {
    const python = readFileSync(IA_ASSEMBLER, 'utf8')
    const block = python.match(/_CLAIMS_BACKING:\s*dict\[str,\s*frozenset\[str\]\]\s*=\s*\{([\s\S]*?)\n\}/)
    expect(block).not.toBeNull()
    const parsed: Record<string, string[]> = {}
    for (const line of block![1]!.split('\n')) {
      const entry = line.match(/"([a-z_]+)":\s*frozenset\(\{([^}]*)\}\)/)
      if (!entry) continue
      parsed[entry[1]!] = [...entry[2]!.matchAll(/"([a-z_]+)"/g)].map(m => m[1]!).sort()
    }
    // La garde doit LIRE les cinq relations, pas zéro.
    expect(Object.keys(parsed).length).toBe(Object.keys(ORG_RELATION_CLAIM_BACKING).length)
    expect(Object.keys(parsed).length).toBeGreaterThanOrEqual(5)
    for (const [relation, claims] of Object.entries(ORG_RELATION_CLAIM_BACKING)) {
      expect(parsed[relation]).toEqual([...claims].sort())
    }
  })

  it('NON — une preuve d’IDENTITÉ ne promeut pas une hypothèse en ligne de reporting', () => {
    // Le P0 lui-même, rejoué par le chemin neuf. Le profil qui établit que la
    // personne EXISTE n'établit pas à qui elle rapporte.
    const next = promote([{ ...OFFICIAL, claim: 'identity' }])
    expect(next).toBeNull()
  })

  it('NON — un titre, un niveau, une appartenance ne promeuvent pas non plus', () => {
    for (const claim of ['title', 'level', 'membership', 'roles'] as const) {
      expect(promote([{ ...OFFICIAL, claim }])).toBeNull()
    }
  })

  it('OUI — une preuve qui a OBSERVÉ le lien crée la ligne, et elle seule est citée', () => {
    const next = promote([{ ...OFFICIAL, claim: 'relation' }])
    expect(next).not.toBeNull()
    const edge = next!.hierarchyEdges.find(e => e.type === 'reports_to')
    expect(edge).toBeDefined()
    expect(edge!.fromId).toBe('p-marie')
    expect(edge!.toId).toBe('p-jean')
    expect(edge!.verified).toBe(true)
    expect(edge!.confidence).toBe(92)
    // ⚠️ La preuve d'identité qui vit sur le nœud N'EST PAS citée par la ligne :
    // c'est très exactement le glissement du P0.
    expect(edge!.sourceIds).toEqual(['s-verify-0'])
    expect(next!.graphVersion).toBe(5)
    // Et la preuve est posée sur le nœud, sinon `sourceIds` ne se résout pas.
    expect(next!.people.find(p => p.id === 'p-marie')!.sources.map(s => s.id)).toContain('s-verify-0')
  })

  it('une preuve du VÉRIFICATEUR sans claim déclaré est déclarée `relation` — une fois, ici', () => {
    // Le service IA ne pose pas encore de `claim` sur ses sources. Cet endpoint
    // est le SEUL dont la sortie soit par construction une observation de la
    // PAIRE : `verdict_from_hits` jette tout hit qui ne nomme pas les deux
    // personnes. Déclarer le claim ici n'est donc pas un contournement de la
    // porte — c'est dire ce que la preuve a vu, pour qu'elle passe par la porte.
    const next = promote([OFFICIAL])
    expect(next).not.toBeNull()
    const promoted = next!.people.find(p => p.id === 'p-marie')!.sources.find(s => s.id === 's-verify-0')
    expect(promoted!.claim).toBe('relation')
  })

  it('un claim DÉCLARÉ n’est jamais réécrit — la déclaration du producteur gagne', () => {
    // Le jour où le service IA déclarera lui-même ses claims, l'API doit le
    // CROIRE, y compris quand il dit « identity ». Sans quoi le tampon de l'API
    // deviendrait un blanc-seing, et la porte une décoration.
    expect(promote([{ ...OFFICIAL, claim: 'identity' }])).toBeNull()
  })

  it('rien trouvé ⇒ rien écrit, et la ligne n’est pas fabriquée', () => {
    expect(promote([], null as unknown as number)).toBeNull()
    expect(
      applyRelationVerdict(graphWithHypothesis(), {
        fromId: 'p-marie',
        toId: 'p-jean',
        type: 'reports_to',
        version: 5,
        at: '2026-08-31T09:00:00.000Z',
        verdict: { verified: true, confidence: null, sources: [{ ...OFFICIAL, claim: 'relation' }] },
      }),
    ).toBeNull()
  })

  it('aucune hypothèse ⇒ aucune promotion — on ne fabrique pas la relation qu’on vérifie', () => {
    const graph = graphWithHypothesis()
    const withoutHypothesis = orgGraphSchema.parse({ ...graph, influenceEdges: [] })
    expect(
      applyRelationVerdict(withoutHypothesis, {
        fromId: 'p-marie',
        toId: 'p-jean',
        type: 'reports_to',
        version: 5,
        at: '2026-08-31T09:00:00.000Z',
        verdict: { verified: true, confidence: 92, sources: [{ ...OFFICIAL, claim: 'relation' }] },
      }),
    ).toBeNull()
  })

  it('l’hypothèse est CONSERVÉE — on archive, on ne supprime pas', () => {
    const next = promote([{ ...OFFICIAL, claim: 'relation' }])
    expect(next!.influenceEdges.filter(e => e.topic === ORG_REPORTING_INFLUENCE_TOPIC)).toHaveLength(1)
  })
})

/**
 * #4016 L4.2 (décision Louis 11/10/2026) — l'arête INFÉRÉE des intitulés passe
 * la porte comme une hypothèse : on peut la VÉRIFIER (elle a un sujet), mais
 * elle ne devient une ligne de l'organigramme QUE sur une preuve qui a observé
 * le lien. La porte dit toujours NON à une relation affirmée sans preuve.
 */
describe('GA-127 — une arête INFÉRÉE (badgée « probable ») passe la même porte', () => {
  function graphWithTitlesOnly(): OrgGraph {
    const graph = graphWithHypothesis()
    return orgGraphSchema.parse({
      ...graph,
      influenceEdges: [],
      people: graph.people.map(person => ({
        ...person,
        hierarchyLevel: person.id === 'p-jean' ? 'L1' : 'L3',
      })),
    })
  }
  const verify = (sources: OrgSource[]) =>
    applyRelationVerdict(graphWithTitlesOnly(), {
      fromId: 'p-marie',
      toId: 'p-jean',
      type: 'reports_to',
      version: 5,
      at: '2026-10-11T09:00:00.000Z',
      verdict: { verified: true, confidence: 92, sources },
    })

  it('le graphe ne porte AUCUNE hypothèse — l’arête vient des seuls intitulés (Responsable Data L3 → DSI L1)', () => {
    expect(orgInferredReportings(graphWithTitlesOnly())).toEqual([
      expect.objectContaining({ fromId: 'p-marie', toId: 'p-jean', source: 'inferred' }),
    ])
  })

  it('OUI — une preuve qui a OBSERVÉ le lien en fait une ligne', () => {
    const next = verify([{ ...OFFICIAL, claim: 'relation' }])
    expect(next?.hierarchyEdges.find(edge => edge.type === 'reports_to')?.sourceIds).toEqual(['s-verify-0'])
  })

  it('NON — une preuve d’identité, un titre ou un niveau ne la promeuvent jamais', () => {
    for (const claim of ['identity', 'title', 'level', 'membership'] as const) {
      expect(verify([{ ...OFFICIAL, claim }])).toBeNull()
    }
  })

  it('NON — sans preuve, rien n’est écrit : l’arête inférée n’entre jamais dans le graphe stocké', () => {
    expect(verify([])).toBeNull()
    expect(graphWithTitlesOnly().hierarchyEdges.some(edge => edge.type === 'reports_to')).toBe(false)
  })
})
