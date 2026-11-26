import type { MatchNeed } from '@bellum/contracts'
import { diffRuns, type CurrentRunView, type PreviousRunSnapshot } from './run-changes'

/**
 * #4059.1 — « Ajouter un CV met à jour la comparaison sans oublier les autres,
 * et dit ce qui a changé » ; #4059.2 — « modifier une exigence explique la
 * révision » ; #4059.3 — une nouvelle version d'une MÊME personne n'est pas un
 * candidat de plus (l'identité est le consultantId, jamais le fichier).
 */

const A = 'aaaaaaaa-0000-4000-8000-000000000001'
const B = 'aaaaaaaa-0000-4000-8000-000000000002'
const C = 'aaaaaaaa-0000-4000-8000-000000000003'

function need(overrides: Partial<MatchNeed> = {}): MatchNeed {
  return {
    needId: null,
    role: 'Dev Java',
    accountName: null,
    accountSector: null,
    projectSectors: [],
    skills: [{ term: 'java', label: 'Java', required: true, level: null }],
    minYears: 5,
    seniorityBand: null,
    environment: [],
    languages: [],
    clearances: [],
    location: 'Paris',
    remote: null,
    startOn: null,
    targetRateCents: null,
    contractKind: null,
    ...overrides,
  } as MatchNeed
}

function previous(overrides: Partial<PreviousRunSnapshot> = {}): PreviousRunSnapshot {
  return {
    runId: 'prev',
    createdAt: '2026-10-11T08:00:00.000Z',
    truncated: false,
    criteria: need(),
    entries: [
      { consultantId: A, rank: 1, bucket: 'recommended', exclusions: [] },
      { consultantId: B, rank: 2, bucket: 'excluded', exclusions: ['availability_conflict'] },
    ],
    ...overrides,
  }
}

function current(overrides: Partial<CurrentRunView> = {}): CurrentRunView {
  return {
    runId: 'cur',
    truncated: false,
    need: need(),
    ordered: [
      { consultantId: A, bucket: 'recommended', exclusions: [] },
      { consultantId: B, bucket: 'excluded', exclusions: ['availability_conflict'] },
    ],
    ...overrides,
  }
}

describe('diffRuns (#4059)', () => {
  it('premier classement : rien à comparer, jamais un diff inventé', () => {
    expect(diffRuns(null, current())).toBeNull()
  })

  it('même classement : tout est inchangé, aucune ligne de nouveauté', () => {
    const changes = diffRuns(previous(), current())
    expect(changes).toMatchObject({
      comparable: true,
      newCandidates: [],
      moved: [],
      leftRanking: [],
      criteria: [],
      unchangedCount: 2,
    })
  })

  it('un CV ajouté entre dans le classement sans effacer les autres', () => {
    const changes = diffRuns(
      previous(),
      current({
        ordered: [
          { consultantId: C, bucket: 'recommended', exclusions: [] },
          { consultantId: A, bucket: 'recommended', exclusions: [] },
          { consultantId: B, bucket: 'excluded', exclusions: ['availability_conflict'] },
        ],
      }),
    )
    expect(changes?.newCandidates).toEqual([{ consultantId: C, rank: 1, bucket: 'recommended', reserves: [] }])
    // A descend d'un rang : c'est ce que le CV ajouté CHANGE.
    expect(changes?.moved).toEqual([
      { consultantId: A, fromRank: 1, toRank: 2, fromBucket: 'recommended', toBucket: 'recommended' },
      { consultantId: B, fromRank: 2, toRank: 3, fromBucket: 'excluded', toBucket: 'excluded' },
    ])
    expect(changes?.unchangedCount).toBe(0)
    expect(changes?.keptReserves).toEqual([{ consultantId: B, reasons: ['availability_conflict'] }])
  })

  it("la même personne (même consultantId) n'est jamais un candidat de plus", () => {
    const changes = diffRuns(
      previous(),
      current({
        ordered: [
          { consultantId: A, bucket: 'borderline', exclusions: [] },
          { consultantId: B, bucket: 'excluded', exclusions: ['availability_conflict'] },
        ],
      }),
    )
    expect(changes?.newCandidates).toEqual([])
    expect(changes?.moved).toEqual([
      { consultantId: A, fromRank: 1, toRank: 1, fromBucket: 'recommended', toBucket: 'borderline' },
    ])
  })

  it('un profil sorti du classement est nommé', () => {
    const changes = diffRuns(
      previous(),
      current({ ordered: [{ consultantId: A, bucket: 'recommended', exclusions: [] }] }),
    )
    expect(changes?.leftRanking).toEqual([{ consultantId: B, previousBucket: 'excluded' }])
  })

  it('une exigence modifiée explique la révision, champ par champ', () => {
    const changes = diffRuns(
      previous(),
      current({
        need: need({
          minYears: 8,
          skills: [
            { term: 'java', label: 'Java', required: true, level: null },
            { term: 'kafka', label: 'Kafka', required: false, level: null },
          ],
        }),
      }),
    )
    expect(changes?.criteria).toEqual([
      { field: 'skills', before: 'Java*', after: 'Java*, Kafka' },
      { field: 'minYears', before: '5', after: '8' },
    ])
  })

  it("un journal tronqué n'autorise aucune comparaison : on le dit, on ne devine pas", () => {
    const changes = diffRuns(previous({ truncated: true }), current())
    expect(changes).toMatchObject({ comparable: false, newCandidates: [], moved: [], leftRanking: [] })
  })
})
