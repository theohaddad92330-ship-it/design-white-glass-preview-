import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { orgGraphSchema, type OrgGraph } from '@bellum/contracts'
import {
  applyOrgGraphCorrection,
  mergeRejectedItems,
  orgPersonIdFor,
  readStoredOrgGraph,
  rejectionFromFeedback,
} from './org-graph-versioning'

/** Graphe minimal mais complet : 2 entités, 2 personnes, 1 edge, 1 siège, 1 étape. */
function graphFixture(): OrgGraph {
  return orgGraphSchema.parse({
    graphVersion: 1,
    entities: [
      { id: 'e-tf1-groupe', name: 'TF1 Groupe', type: 'groupe', parentId: null, confidence: 85 },
      { id: 'e-tf1-pub', name: 'TF1 Pub', type: 'filiale', parentId: 'e-tf1-groupe', confidence: 60 },
    ],
    people: [
      {
        id: 'p-jean-dupont',
        fullName: 'Jean Dupont',
        entityId: 'e-tf1-groupe',
        identityStatus: 'classified',
        confidence: 85,
      },
      {
        id: 'p-marie-martin',
        fullName: 'Marie Martin',
        entityId: 'e-tf1-pub',
        identityStatus: 'classified',
        confidence: 70,
      },
    ],
    hierarchyEdges: [
      {
        fromId: 'p-marie-martin',
        toId: 'p-jean-dupont',
        type: 'reports_to',
        sourceIds: ['s1'],
        confidence: 75,
        verified: false,
      },
    ],
    influenceEdges: [
      {
        fromId: 'p-marie-martin',
        toId: 'p-jean-dupont',
        topic: 'data',
        stance: 'supporter',
        confidence: 60,
        reasoning: 'porte le sujet data',
      },
    ],
    buyingCommittee: [{ personId: 'p-jean-dupont', role: 'economic_buyer', entityId: 'e-tf1-groupe' }],
    uncoveredZones: [{ entityId: 'e-tf1-pub', reason: 'aucun achat identifié' }],
    recommendedPath: [
      { step: 1, personId: 'p-marie-martin', objective: 'qualifier le besoin' },
      { step: 2, personId: 'p-jean-dupont', objective: 'obtenir le budget' },
    ],
    rejectedItems: [],
  })
}

describe('orgPersonIdFor (miroir du slug Python)', () => {
  // Les cas vivent dans un fichier PARTAGÉ, asserté aussi par
  // `apps/ia/tests/test_org_person_id_parity.py`. Deux implémentations du même
  // slug qui divergent ne lèvent aucune erreur : le contact écarté réapparaît
  // simplement au run suivant, ce que la Phase 4 existe pour empêcher. Des
  // exemples recopiés à la main dans chaque suite ne l'auraient pas attrapé —
  // ils auraient dérivé chacun de leur côté.
  const fixture = JSON.parse(
    readFileSync(resolve(__dirname, '../../../../ia/tests/fixtures/org_person_ids.json'), 'utf-8'),
  ) as { cases: Array<{ name: string; id: string }> }

  it.each(fixture.cases)('« $name » → $id', ({ name, id }) => {
    expect(orgPersonIdFor(name)).toBe(id)
  })
})

describe('rejectionFromFeedback', () => {
  it('mémorise un contact signalé parti / faux / hors sujet', () => {
    expect(rejectionFromFeedback({ target: 'contact', targetRef: 'Jean Dupont', verdict: 'obsolete' })).toEqual({
      sourceId: 'p-jean-dupont',
      reason: expect.stringContaining('obsolète'),
    })
    expect(rejectionFromFeedback({ target: 'contact', targetRef: 'Jean Dupont', verdict: 'faux' })?.sourceId).toBe(
      'p-jean-dupont',
    )
  })

  it("n'écarte rien sur un verdict positif — un « utile » ne supprime personne", () => {
    expect(rejectionFromFeedback({ target: 'contact', targetRef: 'Jean Dupont', verdict: 'utile' })).toBeNull()
  })

  it("n'écarte rien sur une surface qui n'est pas un nœud du graphe (play, section, dossier)", () => {
    expect(rejectionFromFeedback({ target: 'play', targetRef: 'Prise de contact DSI', verdict: 'inutile' })).toBeNull()
    expect(rejectionFromFeedback({ target: 'global', targetRef: '', verdict: 'faux' })).toBeNull()
  })

  it('ignore une référence vide (rien à identifier)', () => {
    expect(rejectionFromFeedback({ target: 'contact', targetRef: '   ', verdict: 'faux' })).toBeNull()
  })
})

describe('applyOrgGraphCorrection', () => {
  it('bump la version même quand la correction n’écarte personne', () => {
    const next = applyOrgGraphCorrection(graphFixture(), { version: 2, rejections: [] })
    expect(next?.graphVersion).toBe(2)
    expect(next?.people).toHaveLength(2)
  })

  it('retire le contact écarté de TOUTES les vues et le mémorise', () => {
    const next = applyOrgGraphCorrection(graphFixture(), {
      version: 2,
      rejections: [{ sourceId: 'p-jean-dupont', reason: 'parti' }],
    })
    expect(next).not.toBeNull()
    expect(next?.people.map(p => p.id)).toEqual(['p-marie-martin'])
    expect(next?.hierarchyEdges).toEqual([]) // l'edge pointait vers lui
    expect(next?.influenceEdges).toEqual([])
    expect(next?.buyingCommittee).toEqual([])
    expect(next?.recommendedPath.map(s => s.personId)).toEqual(['p-marie-martin'])
    expect(next?.rejectedItems).toEqual([{ sourceId: 'p-jean-dupont', reason: 'parti' }])
  })

  it('renumérote le chemin recommandé — pas de trou dans la séquence', () => {
    const next = applyOrgGraphCorrection(graphFixture(), {
      version: 2,
      rejections: [{ sourceId: 'p-marie-martin', reason: 'parti' }],
    })
    expect(next?.recommendedPath).toEqual([{ step: 1, personId: 'p-jean-dupont', objective: 'obtenir le budget' }])
  })

  it('coupe les rattachements pendants quand une entité est écartée, sans jeter ses gens', () => {
    const next = applyOrgGraphCorrection(graphFixture(), {
      version: 3,
      rejections: [{ sourceId: 'e-tf1-pub', reason: 'entité cédée' }],
    })
    expect(next?.entities.map(e => e.id)).toEqual(['e-tf1-groupe'])
    expect(next?.people.find(p => p.id === 'p-marie-martin')?.entityId).toBeNull()
    expect(next?.uncoveredZones[0]?.entityId).toBeNull()
  })

  it('rend un graphe qui repasse le contrat (aucun id pendant, aucun rejeté encore actif)', () => {
    const next = applyOrgGraphCorrection(graphFixture(), {
      version: 4,
      rejections: [{ sourceId: 'p-jean-dupont', reason: 'parti' }],
    })
    expect(orgGraphSchema.safeParse(next).success).toBe(true)
  })

  it('accumule la mémoire des rejets successifs sans doublon', () => {
    const first = applyOrgGraphCorrection(graphFixture(), {
      version: 2,
      rejections: [{ sourceId: 'p-jean-dupont', reason: 'parti' }],
    })
    const second = applyOrgGraphCorrection(first as OrgGraph, {
      version: 3,
      rejections: [
        { sourceId: 'p-jean-dupont', reason: 'parti (2e fois)' },
        { sourceId: 'p-marie-martin', reason: 'hors périmètre' },
      ],
    })
    expect(second?.graphVersion).toBe(3)
    expect(second?.rejectedItems.map(r => r.sourceId)).toEqual(['p-jean-dupont', 'p-marie-martin'])
    // Le premier verdict fait foi : la mémoire n'est pas réécrite par un doublon.
    expect(second?.rejectedItems[0]?.reason).toBe('parti')
  })
})

describe('mergeRejectedItems', () => {
  it('dédoublonne par sourceId en gardant la première raison', () => {
    expect(mergeRejectedItems([{ sourceId: 'p-a', reason: 'r1' }], [{ sourceId: 'p-a', reason: 'r2' }])).toEqual([
      { sourceId: 'p-a', reason: 'r1' },
    ])
  })
})

describe('readStoredOrgGraph', () => {
  it('lit le graphe validé sous raw_analysis.org.orgGraph', () => {
    expect(readStoredOrgGraph({ org: { orgGraph: graphFixture() } })?.graphVersion).toBe(1)
  })

  it('rend null sur un dossier ANTÉRIEUR à la feature (pas de bloc org / pas de graphe)', () => {
    expect(readStoredOrgGraph(null)).toBeNull()
    expect(readStoredOrgGraph({})).toBeNull()
    expect(readStoredOrgGraph({ org: {} })).toBeNull()
    expect(readStoredOrgGraph({ org: { orgGraph: { entities: 'nope' } } })).toBeNull()
  })
})
