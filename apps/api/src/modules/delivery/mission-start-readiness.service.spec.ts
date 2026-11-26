import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ConflictException, NotFoundException } from '@nestjs/common'
import {
  MissionStartReadinessService,
  assertMissionStartGate,
  loadMissionStartReadiness,
} from './mission-start-readiness.service'

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'
const USER = 'u0000000-0000-4000-8000-000000000001'
const MISSION = 'm0000000-0000-4000-8000-000000000001'
const NOW = new Date('2026-09-23T10:00:00Z')

type Routes = Record<string, unknown[]>
function makeManager(routes: Routes) {
  const queries: { sql: string; params: unknown[] }[] = []
  const manager = {
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params })
      for (const [needle, rows] of Object.entries(routes)) if (sql.includes(needle)) return rows
      return []
    }),
  }
  return { manager, queries }
}

const dataRow = (over: Record<string, unknown> = {}) => ({
  'AS consultant_assigned': [{ started_on: '2026-10-01', daily_rate: '650.00', consultant_assigned: true, ...over }],
})
const check = (item_key: string, confirmed_at = '2026-09-20T10:00:00Z') => ({
  item_key,
  proof: 'mail du 20/09',
  confirmed_by: USER,
  confirmed_at,
})
const allChecks = {
  'FROM mission_start_checks': ['client_agreement', 'consultant_agreement', 'contract_signed', 'site_access'].map(k =>
    check(k),
  ),
}

describe('loadMissionStartReadiness — #2338 / #2409', () => {
  it('lit la mission ET les gestes non archivés, bornés à l’espace', async () => {
    const { manager, queries } = makeManager({ ...dataRow(), ...allChecks })
    const r = await loadMissionStartReadiness(manager as never, WORKSPACE, MISSION, NOW)
    expect(r?.verdict).toBe('ready')
    const checks = queries.find(q => q.sql.includes('FROM mission_start_checks'))
    expect(checks?.sql).toContain('archived_at IS NULL')
    expect(checks?.params).toEqual([MISSION, WORKSPACE])
    expect(queries.find(q => q.sql.includes('AS consultant_assigned'))?.params).toEqual([MISSION, WORKSPACE])
  })

  it('un TJM absent reste une réserve, jamais 0', async () => {
    const { manager } = makeManager({ ...dataRow({ daily_rate: null }), ...allChecks })
    const r = await loadMissionStartReadiness(manager as never, WORKSPACE, MISSION, NOW)
    expect(r?.verdict).toBe('ready_with_reserves')
    expect(r?.reserves).toEqual(['daily_rate'])
  })

  it('mission hors espace → null', async () => {
    const { manager } = makeManager({})
    expect(await loadMissionStartReadiness(manager as never, WORKSPACE, MISSION, NOW)).toBeNull()
  })
})

describe('assertMissionStartGate — le passage au démarrage', () => {
  it('REFUSE ready_to_start sans les deux accords, en NOMMANT chaque manque', async () => {
    const { manager } = makeManager({ ...dataRow(), 'FROM mission_start_checks': [check('client_agreement')] })
    const error = await assertMissionStartGate(manager as never, WORKSPACE, MISSION, 'draft', 'ready_to_start', NOW)
      .then(() => null)
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ConflictException)
    const body = (error as ConflictException).getResponse() as { code: string; missing: string[]; message: string }
    expect(body.code).toBe('mission_start_gate')
    expect(body.missing).toEqual(['consultant_agreement', 'contract_signed'])
    expect(body.message).toContain('accord du consultant')
    expect(body.message).toContain('contrat')
  })

  it('laisse passer quand tout est réuni', async () => {
    const { manager } = makeManager({ ...dataRow(), ...allChecks })
    await expect(
      assertMissionStartGate(manager as never, WORKSPACE, MISSION, 'onboarding', 'active', NOW),
    ).resolves.toBeUndefined()
  })

  it('ne lit RIEN hors du passage au démarrage (création, annulation, mission en cours)', async () => {
    const { manager, queries } = makeManager({})
    await assertMissionStartGate(manager as never, WORKSPACE, MISSION, 'draft', 'onboarding', NOW)
    await assertMissionStartGate(manager as never, WORKSPACE, MISSION, 'draft', 'cancelled', NOW)
    await assertMissionStartGate(manager as never, WORKSPACE, MISSION, 'ready_to_start', 'active', NOW)
    expect(queries).toHaveLength(0)
  })
})

describe('MissionStartReadinessService — les gestes humains', () => {
  const service = (routes: Routes) => {
    const { manager, queries } = makeManager(routes)
    return { svc: new MissionStartReadinessService({ manager } as never), queries }
  }

  it('confirmer ARCHIVE le geste précédent (jamais DELETE) puis écrit auteur + preuve', async () => {
    const { svc, queries } = service({ 'SELECT id FROM missions': [{ id: MISSION }], ...dataRow(), ...allChecks })
    await svc.confirm(WORKSPACE, USER, MISSION, { item: 'client_agreement', proof: 'mail du client du 20/09' })
    expect(queries.some(q => /DELETE/i.test(q.sql))).toBe(false)
    const archive = queries.findIndex(q => q.sql.includes('UPDATE mission_start_checks SET archived_at'))
    const insert = queries.findIndex(q => q.sql.includes('INSERT INTO mission_start_checks'))
    expect(archive).toBeGreaterThanOrEqual(0)
    expect(insert).toBeGreaterThan(archive)
    expect(queries[insert].params).toEqual([WORKSPACE, MISSION, 'client_agreement', 'mail du client du 20/09', USER])
  })

  it('retirer un geste l’ARCHIVE, ne le supprime pas', async () => {
    const { svc, queries } = service({ 'SELECT id FROM missions': [{ id: MISSION }], ...dataRow() })
    await svc.withdraw(WORKSPACE, USER, MISSION, 'contract_signed')
    expect(queries.some(q => /DELETE/i.test(q.sql))).toBe(false)
    const archive = queries.find(q => q.sql.includes('UPDATE mission_start_checks SET archived_at'))
    expect(archive?.params).toEqual([MISSION, WORKSPACE, 'contract_signed', USER])
  })

  it('mission hors espace → 404, rien n’est écrit', async () => {
    const { svc, queries } = service({})
    await expect(
      svc.confirm(WORKSPACE, USER, MISSION, { item: 'client_agreement', proof: 'mail du 20/09' }),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(queries.some(q => q.sql.includes('INSERT'))).toBe(false)
  })
})

/**
 * #2338 — la création d'une mission reste LIBRE sur ses trois appelants : le
 * formulaire / le matching (`POST /delivery/missions` → `DeliveryService.create`)
 * et le geste `create_mission` d'un projet gagné (`ProjectsController`). Aucun
 * n'enregistre un accord à la place d'un humain, aucun ne passe par la porte :
 * la mission naît « accords à confirmer ».
 */
describe('#2338 — les trois appelants de création ne sont jamais bloqués ni ne s’accordent seuls', () => {
  const src = (rel: string) => readFileSync(join(__dirname, '..', '..', rel), 'utf8')
  const createBody = (() => {
    const s = src('modules/delivery/delivery.service.ts')
    const start = s.indexOf('  async create(')
    const end = s.indexOf('  async updateMission(', start)
    return s.slice(start, end)
  })()

  it.each([
    ['DeliveryService.create (formulaire, matching)', createBody],
    ['DeliveryController (POST /delivery/missions)', src('modules/delivery/delivery.controller.ts')],
    ['ProjectsController (geste create_mission)', src('modules/projects/projects.controller.ts')],
  ])('%s', (_name, code) => {
    expect(code.length).toBeGreaterThan(200) // la garde LIT quelque chose
    expect(code).not.toContain('mission_start_checks')
    expect(code).not.toContain('assertMissionStartGate')
  })

  it('une mission fraîchement créée, sans geste, porte « accords à confirmer »', async () => {
    const { manager } = makeManager({
      'AS consultant_assigned': [{ started_on: null, daily_rate: null, consultant_assigned: false }],
    })
    const r = await loadMissionStartReadiness(manager as never, WORKSPACE, MISSION, NOW)
    expect(r?.agreementsPending).toBe(true)
    expect(r?.verdict).toBe('incomplete')
  })
})
