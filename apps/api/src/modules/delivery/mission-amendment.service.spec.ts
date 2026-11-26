import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { MissionAmendmentService } from './mission-amendment.service'

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'
const USER = 'u0000000-0000-4000-8000-000000000001'
const MISSION = 'm0000000-0000-4000-8000-000000000001'
const AMENDMENT = 'x0000000-0000-4000-8000-000000000001'

function makeService(routes: Record<string, unknown[]> = {}) {
  const queries: { sql: string; params: unknown[] }[] = []
  const manager = {
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params })
      for (const [needle, rows] of Object.entries(routes)) if (sql.includes(needle)) return rows
      return []
    }),
  }
  return { service: new MissionAmendmentService({ manager } as never), queries }
}

const missionExists = { 'SELECT id FROM missions': [{ id: MISSION }] }

const fakeRow = (overrides: Record<string, unknown> = {}) => ({
  id: AMENDMENT,
  mission_id: MISSION,
  event_type: 'daily_rate_change',
  status: 'proposed',
  effective_from: '2026-10-01',
  proof: 'Avenant signé par le client',
  previous_term: null,
  new_term: null,
  pause_cause: null,
  note: null,
  requested_by: USER,
  requested_at: '2026-09-23T08:00:00Z',
  approved_by: null,
  approved_at: null,
  ...overrides,
})

// #2423.1/.2/.3 — proposer un avenant : immuable dès l'écriture, seize types, dix attributs.
describe('MissionAmendmentService — #2423 proposer un avenant', () => {
  it('insère l’avenant PROPOSÉ avec ses attributs, borné à l’espace et à la mission', async () => {
    const { service, queries } = makeService({
      ...missionExists,
      'INSERT INTO mission_amendments': [fakeRow()],
    })
    const result = await service.propose(WORKSPACE, USER, MISSION, {
      eventType: 'daily_rate_change',
      effectiveFrom: '2026-10-01',
      proof: 'Avenant signé par le client',
      previousTerm: { dailyRate: 550 },
      newTerm: { dailyRate: 600 },
    })
    expect(result.status).toBe('proposed')
    expect(result.eventType).toBe('daily_rate_change')
    const insert = queries.find(q => q.sql.includes('INSERT INTO mission_amendments'))
    expect(insert?.params).toEqual([
      WORKSPACE,
      MISSION,
      'daily_rate_change',
      '2026-10-01',
      'Avenant signé par le client',
      JSON.stringify({ dailyRate: 550 }),
      JSON.stringify({ dailyRate: 600 }),
      null,
      null,
      USER,
    ])
  })

  it('refuse une mission introuvable dans l’espace (404)', async () => {
    const { service } = makeService()
    await expect(
      service.propose(WORKSPACE, USER, MISSION, {
        eventType: 'daily_rate_change',
        effectiveFrom: '2026-10-01',
        proof: 'Preuve',
      }),
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it('refuse `pause_start` sans `pauseCause` — les quatre causes ne se devinent pas (#2423.7)', async () => {
    const { service } = makeService(missionExists)
    await expect(
      service.propose(WORKSPACE, USER, MISSION, {
        eventType: 'pause_start',
        effectiveFrom: '2026-10-01',
        proof: 'Preuve',
      }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('accepte `pause_start` avec sa cause nommée', async () => {
    const { service, queries } = makeService({
      ...missionExists,
      'INSERT INTO mission_amendments': [fakeRow({ event_type: 'pause_start', pause_cause: 'client_closure' })],
    })
    await service.propose(WORKSPACE, USER, MISSION, {
      eventType: 'pause_start',
      effectiveFrom: '2026-10-01',
      proof: 'Client ferme en aout',
      pauseCause: 'client_closure',
    })
    const insert = queries.find(q => q.sql.includes('INSERT INTO mission_amendments'))
    expect(insert?.params[7]).toBe('client_closure')
  })
})

// #2423.5 — la table STRICTE : en avant seulement.
describe('MissionAmendmentService — #2423.5 changer le statut d’un avenant', () => {
  const amendmentIn = (status: string) => ({ 'SELECT status FROM mission_amendments': [{ status }] })

  it('proposé → accepté s’écrit et pose approved_by/approved_at', async () => {
    const { service, queries } = makeService({
      ...missionExists,
      ...amendmentIn('proposed'),
      'UPDATE mission_amendments': [
        fakeRow({ status: 'accepted', approved_by: USER, approved_at: '2026-09-23T09:00:00Z' }),
      ],
    })
    const result = await service.changeStatus(WORKSPACE, USER, MISSION, AMENDMENT, { to: 'accepted' })
    expect(result.status).toBe('accepted')
    const update = queries.find(q => q.sql.includes('UPDATE mission_amendments'))
    expect(update?.sql).toContain('approved_by')
    expect(update?.params).toEqual([AMENDMENT, MISSION, WORKSPACE, 'accepted', USER])
  })

  it('un saut proposé → actif est refusé (409), rien n’est écrit', async () => {
    const { service, queries } = makeService({ ...missionExists, ...amendmentIn('proposed') })
    await expect(service.changeStatus(WORKSPACE, USER, MISSION, AMENDMENT, { to: 'active' })).rejects.toBeInstanceOf(
      ConflictException,
    )
    expect(queries.some(q => q.sql.includes('UPDATE mission_amendments'))).toBe(false)
  })

  it('un avenant introuvable dans la mission/espace est 404', async () => {
    const { service } = makeService(missionExists)
    await expect(service.changeStatus(WORKSPACE, USER, MISSION, AMENDMENT, { to: 'accepted' })).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })
})

// #2423.10 — NO-GO : rien ici ne recalcule une période déjà facturée. Ce service
// n'écrit QUE la table `mission_amendments` — jamais `missions`, `mission_timesheets`
// ni `mission_rate_history` — donc aucun recalcul rétroactif ne peut partir d'ici.
describe('MissionAmendmentService — #2423.10 aucune écriture hors `mission_amendments`', () => {
  it('propose() ne touche que `mission_amendments` (et la lecture de la mission)', async () => {
    const { service, queries } = makeService({
      ...missionExists,
      'INSERT INTO mission_amendments': [fakeRow()],
    })
    await service.propose(WORKSPACE, USER, MISSION, {
      eventType: 'daily_rate_change',
      effectiveFrom: '2026-10-01',
      proof: 'Preuve',
    })
    const writes = queries.filter(q => /^\s*(INSERT|UPDATE|DELETE)/i.test(q.sql))
    expect(writes.every(w => w.sql.includes('mission_amendments'))).toBe(true)
  })
})
