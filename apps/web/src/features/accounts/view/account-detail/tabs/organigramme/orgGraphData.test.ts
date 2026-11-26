import { partitionOrgHierarchy, type Contact } from '@bellum/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildOrgGraphViewData, confidenceTier, hasNoProvenHierarchy } from './orgGraphData'

function graph(overrides: Record<string, unknown> = {}) {
  return {
    org: {
      orgGraph: {
        graphVersion: 1,
        entities: [
          {
            id: 'e1',
            name: 'TF1 Groupe',
            type: 'groupe',
            confidence: 85,
            sources: [{ id: 's-e1-registry', kind: 'registry', grounding: 'A', ref: '326300159' }],
          },
        ],
        people: [
          {
            id: 'p1',
            fullName: 'Jean Dupont',
            entityId: 'e1',
            identityStatus: 'classified',
            confidence: 80,
            sources: [
              { id: 's1', kind: 'linkedin', grounding: 'B', ref: 'https://linkedin.com/in/jd' },
              { id: 's-p1-official', kind: 'official_site', grounding: 'A', date: '2026-05-12' },
            ],
          },
          { id: 'p2', fullName: 'Marie Martin', entityId: 'e1', identityStatus: 'classified', confidence: 70 },
        ],
        hierarchyEdges: [
          { fromId: 'p2', toId: 'p1', type: 'reports_to', sourceIds: ['s1'], confidence: 95, verified: true },
          { fromId: 'p1', toId: 'e1', type: 'member_of', sourceIds: [], confidence: 60, verified: false },
        ],
        influenceEdges: [
          {
            fromId: 'p2',
            toId: 'p1',
            topic: 'budget cloud',
            stance: 'supporter',
            confidence: 55,
            reasoning: 'expertise',
          },
        ],
        buyingCommittee: [{ personId: 'p1', role: 'technical_buyer', entityId: 'e1', reason: 'DSI' }],
        recommendedPath: [
          { step: 2, personId: 'p2', objective: 'relais terrain' },
          { step: 1, personId: 'p1', objective: 'sponsor' },
        ],
        rejectedItems: [],
        ...overrides,
      },
    },
  }
}

describe('buildOrgGraphViewData', () => {
  it('returns null when there is no orgGraph', () => {
    expect(buildOrgGraphViewData({})).toBeNull()
    expect(buildOrgGraphViewData({ org: {} })).toBeNull()
  })

  it('returns null on an invalid graph (fails the contract parse)', () => {
    // dangling fromId → contract superRefine rejects
    const bad = graph({
      hierarchyEdges: [
        { fromId: 'ghost', toId: 'p1', type: 'reports_to', sourceIds: ['s'], confidence: 95, verified: true },
      ],
    })
    expect(buildOrgGraphViewData(bad)).toBeNull()
  })

  // #2755.1 — SOPRA STERIA GROUP : `coverage.fallback` mesuré `{attempted:
  // false, failure: null, foundCount: null}` (repli jamais tenté) faisait
  // échouer `orgGraphSchema.safeParse` avant le correctif — un graphe par
  // ailleurs complet (2191 personnes, 10 entités, 26 liens) rendait `null`,
  // écran identique à « pas encore de graphe ». Ne doit plus jamais régresser.
  it('#2755.1 -- un coverage.fallback à null (repli non tenté) ne casse plus le graphe', () => {
    const withNullFallback = graph({
      coverage: {
        discovered: 2191,
        deterministicClassified: 2103,
        llmEnriched: 613,
        fallback: { attempted: false, failure: null, foundCount: null },
      },
    })
    const result = buildOrgGraphViewData(withNullFallback)
    expect(result).not.toBeNull()
    expect(result?.graph.coverage?.fallback).toEqual({ attempted: false, failure: null, foundCount: null })
  })

  // #2755.1 — un graphe INVALIDE (IA/contrat désynchronisés) et un graphe
  // JAMAIS CONSTRUIT rendaient tous les deux `null`, sans un mot : un dossier
  // « Terminé » dont l'assembleur avait réellement échoué s'affichait à
  // l'identique d'un dossier jamais analysé — invérifiable même au code, need
  // to reproduce the incident. Un échec de contrat doit se NOMMER (doctrine :
  // « on ne sait pas » n'est jamais un silence).
  describe('an invalid graph is named, not swallowed', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('logs the parse failure instead of staying silent', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const bad = graph({
        hierarchyEdges: [
          { fromId: 'ghost', toId: 'p1', type: 'reports_to', sourceIds: ['s'], confidence: 95, verified: true },
        ],
      })

      buildOrgGraphViewData(bad)

      expect(spy).toHaveBeenCalledTimes(1)
      const [message] = spy.mock.calls[0] ?? []
      expect(String(message)).toContain('orgGraph')
    })

    it('never logs a person or entity NAME — only the contract path/code', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const bad = graph({
        hierarchyEdges: [
          { fromId: 'ghost', toId: 'p1', type: 'reports_to', sourceIds: ['s'], confidence: 95, verified: true },
        ],
      })

      buildOrgGraphViewData(bad)

      const loggedText = spy.mock.calls.flat().map(String).join(' ')
      expect(loggedText).not.toContain('Jean Dupont')
      expect(loggedText).not.toContain('Marie Martin')
      expect(loggedText).not.toContain('TF1 Groupe')
    })

    it('does not log anything when the graph is simply absent (nothing to name)', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      buildOrgGraphViewData({})
      buildOrgGraphViewData({ org: {} })
      expect(spy).not.toHaveBeenCalled()
    })
  })

  it('splits verified vs inferred hierarchy edges', () => {
    const data = buildOrgGraphViewData(graph())!
    expect(data.verifiedEdges).toHaveLength(1)
    expect(data.verifiedEdges[0]?.confidence).toBe(95)
    expect(data.inferredEdges).toHaveLength(1)
    expect(data.inferredEdges[0]?.verified).toBe(false)
  })

  it('resolves person and entity ids to display names', () => {
    const data = buildOrgGraphViewData(graph())!
    expect(data.nameOf('p1')).toBe('Jean Dupont')
    expect(data.nameOf('e1')).toBe('TF1 Groupe')
    expect(data.entityNameOf('e1')).toBe('TF1 Groupe')
    expect(data.entityNameOf(null)).toBeNull()
  })

  it('orders the recommended path by step', () => {
    const data = buildOrgGraphViewData(graph())!
    expect(data.path.map(s => s.step)).toEqual([1, 2])
  })

  it('exposes counts for the view chrome', () => {
    const data = buildOrgGraphViewData(graph())!
    expect(data.counts).toEqual({ entities: 1, people: 2, verified: 1, inferred: 1, influence: 1 })
  })

  // « Les relations vérifiées sont pleines et CITENT LEUR SOURCE » (annexe p5).
  // Les enregistrements de provenance sont émis sur les nœuds ; sans résolveur,
  // les `sourceIds` d'un lien ne pointaient sur rien d'affichable.
  describe('sourcesOf', () => {
    it('résout les sourceIds d’un lien sur les preuves portées par les nœuds', () => {
      const data = buildOrgGraphViewData(graph())!
      expect(data.sourcesOf(['s1']).map(s => s.kind)).toEqual(['linkedin'])
      expect(data.sourcesOf(['s-e1-registry']).map(s => s.grounding)).toEqual(['A'])
      expect(data.sourcesOf(['s-p1-official'])[0]?.date).toBe('2026-05-12')
    })

    it('ignore un id qui ne correspond à aucune preuve — jamais de source fantôme', () => {
      const data = buildOrgGraphViewData(graph())!
      expect(data.sourcesOf(['s-inconnu'])).toEqual([])
      expect(data.sourcesOf([])).toEqual([])
    })

    it('ne cite jamais deux fois la même preuve', () => {
      const data = buildOrgGraphViewData(graph())!
      expect(data.sourcesOf(['s1', 's1'])).toHaveLength(1)
    })
  })

  // #2919/#2310.2/.13-.21/.37/.40 — les vues « Équipes » et « Relations workspace ».
  describe('teams + relationalEdges (#2919)', () => {
    it('un graphe sans équipe ni edge relationnel rend deux listes vides', () => {
      const data = buildOrgGraphViewData(graph())!
      expect(data.teams).toEqual([])
      expect(data.relationalEdges).toEqual([])
    })

    it('ne retient que les entités de type equipe dans `teams`', () => {
      const data = buildOrgGraphViewData(
        graph({
          entities: [
            { id: 'e1', name: 'TF1 Groupe', type: 'groupe', confidence: 85, sources: [] },
            { id: 'e-squad', name: 'Squad Data', type: 'equipe', parentId: 'e1', confidence: 70, sources: [] },
          ],
        }),
      )!
      expect(data.teams.map(t => t.id)).toEqual(['e-squad'])
    })

    it('expose relationalEdges TEL QUEL, avec son scope et son auteur', () => {
      const data = buildOrgGraphViewData(
        graph({
          relationalEdges: [
            {
              fromId: 'p1',
              toId: 'e1',
              type: 'owns_project',
              scope: 'workspace',
              author: 'Louis',
              sourceIds: [],
              confidence: 55,
            },
          ],
        }),
      )!
      expect(data.relationalEdges).toHaveLength(1)
      expect(data.relationalEdges[0]).toMatchObject({ type: 'owns_project', scope: 'workspace', author: 'Louis' })
    })
  })

  // #3742/#3744 (reste) — la carte d'influence/l'organigramme ne suivaient pas
  // le même filtre géographique que les contacts.
  describe('contacts écartés (#3742/#3744)', () => {
    it('retire du graphe une personne dont le contact correspondant est écarté (excluded_at)', () => {
      const marieEcartee = { id: 'c-marie', full_name: 'Marie Martin', excluded_at: '2026-10-07' } as Contact
      const data = buildOrgGraphViewData(graph(), [marieEcartee])!
      expect(data.graph.people.map(p => p.id)).toEqual(['p1'])
      // L'arête p2→p1 (Marie écartée) disparaît ; celle de p1 (Jean, gardé) vers
      // l'entité e1 reste.
      expect(data.graph.hierarchyEdges.map(e => [e.fromId, e.toId])).toEqual([['p1', 'e1']])
      expect(data.graph.influenceEdges).toEqual([])
      // Le comité d'achat ne citait que p1 (Jean, gardé) : inchangé.
      expect(data.graph.buyingCommittee.map(m => m.personId)).toEqual(['p1'])
      expect(data.counts.people).toBe(1)
    })

    it('ne change rien quand aucun contact écarté ne correspond à une personne du graphe', () => {
      const marieActive = { id: 'c-marie', full_name: 'Marie Martin', excluded_at: null } as Contact
      const data = buildOrgGraphViewData(graph(), [marieActive])!
      expect(data.graph.people.map(p => p.id)).toEqual(['p1', 'p2'])
    })

    it('comportement inchangé sans le paramètre `contacts` (appelants existants)', () => {
      const data = buildOrgGraphViewData(graph())!
      expect(data.graph.people.map(p => p.id)).toEqual(['p1', 'p2'])
    })
  })
})

// Les SEUILS p14 : 90-100 vérifié, 70-89 probable, 50-69 hypothèse. L'écran n'en
// rendait que deux (« vérifié » / « inféré ») : « probable » et « hypothèse »
// portaient le même mot, séparés par la seule teinte du badge.
describe('confidenceTier', () => {
  it('rend les trois paliers de la p14', () => {
    expect(confidenceTier(95, true)).toBe('verified')
    expect(confidenceTier(78, false)).toBe('probable')
    expect(confidenceTier(70, false)).toBe('probable')
    expect(confidenceTier(69, false)).toBe('hypothesis')
    expect(confidenceTier(55, false)).toBe('hypothesis')
  })

  it('ne promeut jamais un lien non vérifié, quel que soit son score', () => {
    expect(confidenceTier(95, false)).toBe('probable')
  })
})

import { computeGraphConfidence } from './orgGraphData'
import { orgGraphSchema } from '@bellum/contracts'

/**
 * Score de confiance du graphe (p19/p30) : dérivé déterministe des nœuds,
 * recalculé à chaque lecture — donc à jour après une correction, sans full rerun.
 */
describe('computeGraphConfidence', () => {
  const g = (over: Record<string, unknown>) =>
    orgGraphSchema.parse({
      graphVersion: 1,
      entities: [{ id: 'e', name: 'Cible', type: 'groupe', confidence: 90, status: 'operating' }],
      people: [],
      hierarchyEdges: [],
      influenceEdges: [],
      buyingCommittee: [],
      uncoveredZones: [],
      recommendedPath: [],
      rejectedItems: [],
      ...over,
    })

  it('moyenne les confiances des personnes (les nœuds qui décident)', () => {
    const graph = g({
      people: [
        { id: 'p1', fullName: 'A', identityStatus: 'classified', decisionRoles: [], confidence: 80 },
        { id: 'p2', fullName: 'B', identityStatus: 'classified', decisionRoles: [], confidence: 60 },
      ],
    })
    expect(computeGraphConfidence(graph)).toBe(70)
  })

  it('sans personne, retombe sur la confiance des entités', () => {
    expect(computeGraphConfidence(g({ people: [] }))).toBe(90)
  })

  it('un graphe sans nœud rend null, jamais un zéro trompeur', () => {
    expect(computeGraphConfidence(g({ entities: [], people: [] }))).toBeNull()
  })

  it('SANS FULL RERUN : élaguer un contact faible remonte le score', () => {
    const before = g({
      people: [
        { id: 'p1', fullName: 'A', identityStatus: 'classified', decisionRoles: [], confidence: 90 },
        { id: 'p2', fullName: 'B', identityStatus: 'classified', decisionRoles: [], confidence: 50 },
      ],
    })
    // Correction = le contact faible est retiré du graphe stocké.
    const after = g({
      people: [{ id: 'p1', fullName: 'A', identityStatus: 'classified', decisionRoles: [], confidence: 90 }],
    })
    expect(computeGraphConfidence(before)).toBe(70)
    expect(computeGraphConfidence(after)).toBe(90)
  })

  it('est exposé par le read-model (buildOrgGraphViewData)', () => {
    const data = buildOrgGraphViewData(graph())
    expect(data).not.toBeNull()
    expect(typeof data!.graphConfidence).toBe('number')
  })
})

/**
 * Référence D38 — le partage « sourcé / hypothèse » change de MAISON, pas de
 * résultat. Ces assertions décrivent ce que l'écran reçoit aujourd'hui, trait
 * par trait et dans l'ordre. Elles sont vertes AVANT le déplacement du calcul
 * vers le contrat, et doivent l'être APRÈS : c'est la preuve que le refactoring
 * n'a rien déplacé de ce que l'utilisateur voit.
 */
describe('la partition vérifié / inféré — état de référence', () => {
  const FOUR_EDGES = {
    hierarchyEdges: [
      { fromId: 'p1', toId: 'e1', type: 'member_of', sourceIds: [], confidence: 60, verified: false },
      { fromId: 'p2', toId: 'p1', type: 'reports_to', sourceIds: ['s1'], confidence: 95, verified: true },
      { fromId: 'p2', toId: 'e1', type: 'member_of', sourceIds: [], confidence: 89, verified: false },
      { fromId: 'p1', toId: 'e1', type: 'reports_to', sourceIds: ['s-p1-official'], confidence: 90, verified: true },
    ],
  }

  it('garde l’ORDRE du graphe dans chacune des deux listes', () => {
    // OrgGraphViews retrie ensuite pour l'affichage ; si la partition elle-même
    // triait, deux tris se superposeraient et la liste rendue changerait.
    const data = buildOrgGraphViewData(graph(FOUR_EDGES))!
    expect(data.verifiedEdges.map(e => `${e.fromId}->${e.toId}:${e.type}`)).toEqual([
      'p2->p1:reports_to',
      'p1->e1:reports_to',
    ])
    expect(data.inferredEdges.map(e => `${e.fromId}->${e.toId}:${e.type}`)).toEqual([
      'p1->e1:member_of',
      'p2->e1:member_of',
    ])
  })

  it('ne perd ni ne duplique aucun lien hiérarchique', () => {
    const data = buildOrgGraphViewData(graph(FOUR_EDGES))!
    expect(data.verifiedEdges.length + data.inferredEdges.length).toBe(data.graph.hierarchyEdges.length)
    expect([...data.verifiedEdges, ...data.inferredEdges]).toEqual(expect.arrayContaining(data.graph.hierarchyEdges))
  })

  it('les compteurs et « majoritairement devinée » lisent la MÊME partition', () => {
    const data = buildOrgGraphViewData(graph(FOUR_EDGES))!
    expect(data.counts.verified).toBe(2)
    expect(data.counts.inferred).toBe(2)
    // 2/4 = 50 % < 60 % : la carte n'est pas déclarée majoritairement devinée.
    expect(data.mostlyInferred).toBe(false)
  })

  it('vient du CONTRAT, pas d’un filtre local (D38)', () => {
    // Un filtre recopié ici redeviendrait une dérivation parallèle : il suffit
    // qu'une des deux copies se mette à lire la confiance pour qu'un même lien
    // soit un fait sur un écran et une hypothèse sur l'autre.
    const data = buildOrgGraphViewData(graph(FOUR_EDGES))!
    const contrat = partitionOrgHierarchy(data.graph.hierarchyEdges)
    expect(contrat.verified.length + contrat.inferred.length).toBeGreaterThan(0)
    expect(data.verifiedEdges).toEqual(contrat.verified)
    expect(data.inferredEdges).toEqual(contrat.inferred)
  })

  it('le partage se fait sur le DRAPEAU, pas sur la confiance', () => {
    // Un lien à 89 sans preuve reste une hypothèse ; c'est l'arbitrage §49, et
    // il ne doit pas se perdre en déplaçant le calcul.
    const data = buildOrgGraphViewData(graph(FOUR_EDGES))!
    expect(data.inferredEdges.map(e => e.confidence)).toEqual([60, 89])
    expect(data.verifiedEdges.every(e => e.verified)).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// AUCUN LIEN PROUVÉ ⇒ CE N'EST PAS UN ORGANIGRAMME — retour Julien Laszlo
// (Aquila Data Enabler), 03/09/2026 : « les organigrammes ne sont pas justes ».
//
// Vérifié sur son run KNDS avant de toucher au code : le prompt n'invente AUCUN
// lien hiérarchique, et l'écran l'écrit même en toutes lettres (« hiérarchie
// inférée des intitulés de poste — Apollo ne fournit pas les liens
// managériaux »). Le défaut n'est donc pas une hallucination, c'est que la vue
// DESSINE quand même des paliers Direction / Management / Opérationnel, ce qui
// se lit comme une hiérarchie par quelqu'un qui connaît la société.
//
// `isMostlyInferred` ne couvrait pas ce cas : elle rend `null` à zéro lien, au
// nom de « je ne sais pas n'est pas je devine » — juste pour les ARÊTES, mais
// c'est précisément le cas KNDS, où il n'y a aucune arête du tout. Résultat :
// aucun avertissement sur la carte la plus muette de toutes.
// ─────────────────────────────────────────────────────────────────────────────

describe('hasNoProvenHierarchy', () => {
  it('déclare la carte quand des personnes existent sans aucun lien (le cas KNDS)', () => {
    expect(hasNoProvenHierarchy({ people: 293, verified: 0, inferred: 0 })).toBe(true)
  })

  it('ne déclare rien dès qu’un seul lien existe — `mostlyInferred` prend le relais', () => {
    expect(hasNoProvenHierarchy({ people: 293, verified: 0, inferred: 1 })).toBe(false)
    expect(hasNoProvenHierarchy({ people: 293, verified: 1, inferred: 0 })).toBe(false)
  })

  it('ne déclare rien sur un graphe vide : sans personne, il n’y a pas de carte à corriger', () => {
    expect(hasNoProvenHierarchy({ people: 0, verified: 0, inferred: 0 })).toBe(false)
  })
})
