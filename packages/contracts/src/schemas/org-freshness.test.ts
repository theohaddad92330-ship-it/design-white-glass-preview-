import { describe, expect, it } from 'vitest'
import {
  ORG_FRESHNESS_STALE_AFTER_DAYS,
  ORG_FRESHNESS_STATES,
  orgRevalidationQueue,
  readOrgFreshness,
  readVerifiedWithFreshness,
} from './org-freshness.js'
import { orgGraphSchema } from './org-graph.js'

const NOW = new Date('2026-08-31T00:00:00.000Z')

/** Une date à N jours dans le passé, au format ISO. */
function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString()
}

describe('readOrgFreshness — « jamais vérifié » n’est pas un tiret muet', () => {
  it('rend `never_verified` sur une absence, SANS date ni âge inventés', () => {
    for (const absent of [null, undefined, '']) {
      expect(readOrgFreshness(absent, NOW)).toEqual({
        state: 'never_verified',
        lastVerifiedAt: null,
        ageDays: null,
      })
    }
  })

  it('rend `never_verified` sur une date ILLISIBLE — jamais un 0 jour', () => {
    expect(readOrgFreshness('bientôt', NOW)).toEqual({
      state: 'never_verified',
      lastVerifiedAt: null,
      ageDays: null,
    })
  })

  it('rend `fresh` en deçà du seuil, avec la date ET l’âge mesurés', () => {
    const verifiedAt = daysAgo(10)
    expect(readOrgFreshness(verifiedAt, NOW)).toEqual({
      state: 'fresh',
      lastVerifiedAt: verifiedAt,
      ageDays: 10,
    })
  })

  it('bascule à `stale` À PARTIR du seuil, pas un jour après', () => {
    expect(readOrgFreshness(daysAgo(ORG_FRESHNESS_STALE_AFTER_DAYS - 1), NOW).state).toBe('fresh')
    expect(readOrgFreshness(daysAgo(ORG_FRESHNESS_STALE_AFTER_DAYS), NOW).state).toBe('stale')
  })

  it('garde la date d’un fait périmé — « information de mars 2026, à revérifier »', () => {
    const mars = '2026-03-02T09:00:00.000Z'
    const freshness = readOrgFreshness(mars, NOW)
    expect(freshness.state).toBe('stale')
    expect(freshness.lastVerifiedAt).toBe(mars)
    expect(freshness.ageDays).toBeGreaterThan(ORG_FRESHNESS_STALE_AFTER_DAYS)
  })

  it('une date FUTURE ne rend jamais un âge négatif', () => {
    const demain = new Date(NOW.getTime() + 86_400_000).toISOString()
    expect(readOrgFreshness(demain, NOW)).toEqual({ state: 'fresh', lastVerifiedAt: demain, ageDays: 0 })
  })

  it('les trois états sont figés et exhaustifs', () => {
    expect(ORG_FRESHNESS_STATES).toEqual(['never_verified', 'fresh', 'stale'])
  })
})

describe('readVerifiedWithFreshness — un fait périmé redevient INCONNU avec sa date', () => {
  it('un lien vérifié et frais reste vérifié', () => {
    const read = readVerifiedWithFreshness({ verified: true, lastVerifiedAt: daysAgo(3) }, NOW)
    expect(read.verified).toBe(true)
    expect(read.freshness.state).toBe('fresh')
  })

  it('un lien vérifié mais PÉRIMÉ se lit non vérifié — sa date reste là', () => {
    const vieux = daysAgo(400)
    const read = readVerifiedWithFreshness({ verified: true, lastVerifiedAt: vieux }, NOW)
    expect(read.verified).toBe(false)
    expect(read.freshness).toEqual({ state: 'stale', lastVerifiedAt: vieux, ageDays: 400 })
  })

  it('un lien vérifié SANS date de vérification se lit non vérifié, « jamais vérifié »', () => {
    const read = readVerifiedWithFreshness({ verified: true }, NOW)
    expect(read.verified).toBe(false)
    expect(read.freshness.state).toBe('never_verified')
  })

  it('un lien NON vérifié ne devient jamais vrai par fraîcheur', () => {
    const read = readVerifiedWithFreshness({ verified: false, lastVerifiedAt: daysAgo(1) }, NOW)
    expect(read.verified).toBe(false)
  })
})

/** Un graphe minimal valide, avec les cas de fraîcheur qui nous intéressent. */
function graphFixture() {
  return orgGraphSchema.parse({
    graphVersion: 3,
    entities: [{ id: 'e1', name: 'ACME', type: 'groupe', status: 'operating', confidence: 90 }],
    people: [
      {
        id: 'p-frais',
        fullName: 'Claire Perrin',
        entityId: 'e1',
        identityStatus: 'verified_identity',
        confidence: 90,
        lastVerifiedAt: daysAgo(4),
      },
      {
        id: 'p-perime',
        fullName: 'Marc Dubois',
        entityId: 'e1',
        identityStatus: 'verified_identity',
        confidence: 80,
        lastVerifiedAt: daysAgo(365),
      },
      { id: 'p-jamais', fullName: 'Alice Fournier', entityId: 'e1', identityStatus: 'seed', confidence: 60 },
      {
        id: 'p-plus-vieux',
        fullName: 'Bruno Lemaire',
        entityId: 'e1',
        identityStatus: 'seed',
        confidence: 60,
        lastVerifiedAt: daysAgo(900),
      },
    ],
    hierarchyEdges: [
      {
        fromId: 'p-perime',
        toId: 'p-frais',
        type: 'reports_to',
        sourceIds: ['s1'],
        confidence: 95,
        verified: true,
        lastVerifiedAt: daysAgo(500),
      },
      { fromId: 'p-jamais', toId: 'p-frais', type: 'reports_to', confidence: 40, verified: false },
    ],
  })
}

describe('orgRevalidationQueue — la file de revérification', () => {
  it('ne retient QUE ce qui est périmé ou jamais vérifié', () => {
    const queue = orgRevalidationQueue(graphFixture(), NOW)
    const ids = queue.map(entry => entry.targetId)
    expect(ids).not.toContain('p-frais')
    expect(ids).toContain('p-perime')
    expect(ids).toContain('p-jamais')
  })

  it('classe les PÉRIMÉS d’abord, du plus vieux au plus récent', () => {
    const queue = orgRevalidationQueue(graphFixture(), NOW)
    const stale = queue.filter(entry => entry.freshness.state === 'stale')
    const ages = stale.map(entry => entry.freshness.ageDays)
    expect(ages).toEqual([...ages].sort((a, b) => (b ?? 0) - (a ?? 0)))
    // 900 j (personne) puis 500 j (relation) puis 365 j (personne).
    expect(stale.map(entry => entry.targetId)).toEqual(['p-plus-vieux', 'p-perime|reports_to|p-frais', 'p-perime'])
  })

  it('range les « jamais vérifié » APRÈS les périmés', () => {
    const queue = orgRevalidationQueue(graphFixture(), NOW)
    const firstNever = queue.findIndex(entry => entry.freshness.state === 'never_verified')
    const lastStale = queue.map(entry => entry.freshness.state).lastIndexOf('stale')
    expect(firstNever).toBeGreaterThan(lastStale)
  })

  it('désigne une relation par ses IDS, jamais par un nom (homonymes)', () => {
    const queue = orgRevalidationQueue(graphFixture(), NOW)
    const relation = queue.find(entry => entry.kind === 'relation')
    expect(relation?.targetId).toBe('p-perime|reports_to|p-frais')
  })

  it('rend une file VIDE sur un graphe entièrement frais — jamais une file inventée', () => {
    const graph = orgGraphSchema.parse({
      entities: [{ id: 'e1', name: 'ACME', type: 'groupe', status: 'operating', confidence: 90 }],
      people: [
        {
          id: 'p1',
          fullName: 'Claire Perrin',
          entityId: 'e1',
          identityStatus: 'verified_identity',
          confidence: 90,
          lastVerifiedAt: daysAgo(1),
        },
      ],
    })
    expect(orgRevalidationQueue(graph, NOW)).toEqual([])
  })
})
