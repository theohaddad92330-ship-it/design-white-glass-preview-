import { NotFoundException } from '@nestjs/common'
import { RecordLinksService } from './record-links.service'

/** Un dépôt en mémoire : égalité sur les colonnes du `where`, `In` pris en charge. */
function fakeRepo<T extends { id: string }>(rows: T[]) {
  const match = (row: T, where: Record<string, unknown>) =>
    Object.entries(where).every(([key, expected]) => {
      const actual = (row as Record<string, unknown>)[key]
      const op = expected as { _type?: string; _value?: unknown[] }
      return op && op._type === 'in' ? (op._value ?? []).includes(actual) : actual === expected
    })
  return {
    findOne: async ({ where }: { where: Record<string, unknown> }) => rows.find(r => match(r, where)) ?? null,
    find: async ({ where }: { where: Record<string, unknown> }) => rows.filter(r => match(r, where)),
  }
}

const WS = '00000000-0000-4000-8000-0000000000a1'
const OTHER_WS = '00000000-0000-4000-8000-0000000000b2'
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

const ACCOUNT = { id: id(1), workspace_id: WS, company_name: 'Orange', trade_name: null }
const OPP = {
  id: id(2),
  workspace_id: WS,
  account_id: id(1),
  label: 'Refonte SI',
  stage: 'qualified',
  objective: null,
  expected_close_on: null,
  urgency: null,
}
const NEED = {
  id: id(3),
  workspace_id: WS,
  account_id: id(1),
  project_id: id(2),
  title: 'Dev Java',
  status: 'confirmed',
  seniority: null,
}
const CONSULTANT = { id: id(4), workspace_id: WS, full_name: 'Alice Martin', title: 'Dev', availability: 'available' }
const SUB = {
  id: id(5),
  workspace_id: WS,
  project_id: id(2),
  need_id: id(3),
  consultant_id: id(4),
  stage: 'shortlisted',
}
const MISSION = {
  id: id(6),
  workspace_id: WS,
  account_id: id(1),
  opportunity_id: id(2),
  need_id: id(3),
  submission_id: id(5),
  label: 'Mission Orange',
  status: 'active',
  role_title: null,
  started_on: null,
  ends_on: null,
}
const ASSIGN = { id: id(7), workspace_id: WS, mission_id: id(6), consultant_id: id(4) }
const TRANSITION = {
  id: id(8),
  workspace_id: WS,
  subject_type: 'need',
  subject_id: id(3),
  from_state: 'to_qualify',
  to_state: 'confirmed',
  proof: null,
  occurred_at: new Date('2026-10-01T10:00:00Z'),
}

function build(overrides: { opps?: unknown[]; missions?: unknown[] } = {}) {
  const repos = {
    opps: fakeRepo((overrides.opps ?? [OPP]) as (typeof OPP)[]),
    needs: fakeRepo([NEED]),
    subs: fakeRepo([SUB]),
    missions: fakeRepo((overrides.missions ?? [MISSION]) as (typeof MISSION)[]),
    assignments: fakeRepo([ASSIGN]),
    consultants: fakeRepo([CONSULTANT]),
    accounts: fakeRepo([ACCOUNT]),
    transitions: fakeRepo([TRANSITION]),
  }
  return new RecordLinksService(
    repos.opps as never,
    repos.needs as never,
    repos.subs as never,
    repos.missions as never,
    repos.assignments as never,
    repos.consultants as never,
    repos.accounts as never,
    repos.transitions as never,
  )
}

const kindsOf = (r: { links: { kind: string }[] }) => r.links.map(g => g.kind)

describe('RecordLinksService — les cinq types', () => {
  it('opportunité → compte, besoins, positionnements, missions', async () => {
    const r = await build().read(WS, 'opportunity', OPP.id)
    expect(r.label).toBe('Refonte SI')
    expect(kindsOf(r)).toEqual(['account', 'need', 'submission', 'mission'])
    expect(r.links.find(g => g.kind === 'account')?.items[0]?.label).toBe('Orange')
  })

  // #4191 (recette 2, E4) — une affaire de renouvellement remonte la mission qu'elle PROLONGE
  // (`missions.renewal_opportunity_id`), pas seulement celles qui en sont ISSUES.
  it('opportunité de renouvellement → la mission prolongée', async () => {
    const RENEWED = {
      ...MISSION,
      id: id(9),
      opportunity_id: null,
      renewal_opportunity_id: OPP.id,
      label: 'Mission en cours',
    }
    const r = await build({ missions: [RENEWED] }).read(WS, 'opportunity', OPP.id)
    expect(r.links.find(g => g.kind === 'mission')?.items.map(i => i.label)).toEqual(['Mission en cours'])
  })

  it('une mission à la fois issue ET prolongée par la même affaire ne se répète pas', async () => {
    const BOTH = { ...MISSION, renewal_opportunity_id: OPP.id }
    const r = await build({ missions: [BOTH] }).read(WS, 'opportunity', OPP.id)
    expect(r.links.find(g => g.kind === 'mission')?.items).toHaveLength(1)
  })

  it('mission → l’affaire de renouvellement qui la prolonge, à côté de l’affaire d’origine', async () => {
    const RENEWAL = { ...OPP, id: id(10), label: 'Renouvellement' }
    const M = { ...MISSION, renewal_opportunity_id: RENEWAL.id }
    const r = await build({ missions: [M], opps: [OPP, RENEWAL] }).read(WS, 'mission', M.id)
    expect(r.links.find(g => g.kind === 'opportunity')?.items.map(i => i.label)).toEqual([
      'Refonte SI',
      'Renouvellement',
    ])
  })

  it('besoin → opportunité, positionnements, missions + son historique', async () => {
    const r = await build().read(WS, 'need', NEED.id)
    expect(kindsOf(r)).toEqual(['opportunity', 'submission', 'mission'])
    expect(r.history).toHaveLength(1)
    expect(r.history[0]?.toState).toBe('confirmed')
  })

  it('positionnement → besoin, opportunité, consultant, mission', async () => {
    const r = await build().read(WS, 'submission', SUB.id)
    expect(r.label).toBe('Alice Martin')
    expect(kindsOf(r)).toEqual(['need', 'opportunity', 'consultant', 'mission'])
  })

  it('mission → compte, opportunité, besoin, positionnement, consultants (mission_assignments)', async () => {
    const r = await build().read(WS, 'mission', MISSION.id)
    expect(kindsOf(r)).toEqual(['account', 'opportunity', 'need', 'submission', 'consultant'])
    expect(r.links.find(g => g.kind === 'consultant')?.items[0]?.id).toBe(CONSULTANT.id)
  })

  it('consultant → positionnements ouverts, missions', async () => {
    const r = await build().read(WS, 'consultant', CONSULTANT.id)
    expect(r.label).toBe('Alice Martin')
    expect(kindsOf(r)).toEqual(['submission', 'mission'])
  })

  it('un lien absent ne fait AUCUN groupe', async () => {
    const r = await build().read(WS, 'need', NEED.id)
    expect(r.links.every(g => g.items.length > 0)).toBe(true)
  })

  it('une propriété non renseignée sort avec value null, jamais « 0 »', async () => {
    const r = await build().read(WS, 'opportunity', OPP.id)
    expect(r.properties.find(p => p.key === 'objective')?.value).toBeNull()
  })
})

describe('RecordLinksService — isolation des espaces', () => {
  it.each([
    ['opportunity', OPP.id],
    ['need', NEED.id],
    ['submission', SUB.id],
    ['mission', MISSION.id],
    ['consultant', CONSULTANT.id],
  ] as const)('un %s d’un autre espace est introuvable', async (kind, recordId) => {
    await expect(build().read(OTHER_WS, kind, recordId)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('un voisin d’un autre espace n’apparaît jamais dans les liens', async () => {
    const foreignOpp = { ...OPP, id: id(99), workspace_id: OTHER_WS }
    const r = await build({ opps: [OPP, foreignOpp] }).read(WS, 'need', NEED.id)
    const ids = r.links.flatMap(g => g.items.map(i => i.id))
    expect(ids).not.toContain(id(99))
  })
})
