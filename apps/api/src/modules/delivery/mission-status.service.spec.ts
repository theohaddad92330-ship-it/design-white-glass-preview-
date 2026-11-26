import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { MissionStatusService } from './mission-status.service'

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'
const USER = 'u0000000-0000-4000-8000-000000000001'
const MISSION = 'm0000000-0000-4000-8000-000000000001'
const ASSIGNMENT = 'a0000000-0000-4000-8000-000000000001'

function makeService(routes: Record<string, unknown[]> = {}) {
  const queries: { sql: string; params: unknown[] }[] = []
  const manager = {
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params })
      for (const [needle, rows] of Object.entries(routes)) if (sql.includes(needle)) return rows
      return []
    }),
  }
  return { service: new MissionStatusService({ manager } as never), queries }
}

const missionIn = (status: string) => ({ 'SELECT status FROM missions': [{ status }] })

// #2338 / #2409 — une mission PRÊTE au démarrage : les deux accords, le contrat,
// l'accès, un consultant, une date et un TJM.
const readyToStart = {
  'AS consultant_assigned': [{ started_on: '2026-10-01', daily_rate: 650, consultant_assigned: true }],
  'FROM mission_start_checks': ['client_agreement', 'consultant_agreement', 'contract_signed', 'site_access'].map(
    item_key => ({ item_key, proof: 'mail du 20/09', confirmed_by: USER, confirmed_at: new Date().toISOString() }),
  ),
}

// Tranché par Louis 22/09 soir (decisions §9).
describe('MissionStatusService — #2407.5 le statut de la MISSION', () => {
  it('un passage EN AVANT s’écrit, borné à l’espace, et se journalise', async () => {
    const { service, queries } = makeService({ ...missionIn('draft'), ...readyToStart })
    const result = await service.changeMissionStatus(WORKSPACE, USER, MISSION, { to: 'ready_to_start' })
    expect(result).toEqual({ from: 'draft', to: 'ready_to_start', direction: 'forward' })
    const update = queries.find(q => q.sql.includes('UPDATE missions SET status'))
    expect(update?.params).toEqual([MISSION, WORKSPACE, 'ready_to_start'])
    const journal = queries.find(q => q.sql.includes('INSERT INTO mission_status_transitions'))
    expect(journal?.params).toEqual([
      WORKSPACE,
      MISSION,
      null,
      'mission',
      'draft',
      'ready_to_start',
      'forward',
      null,
      USER,
    ])
  })

  it('#2338 — le passage à « prête à démarrer » SANS les deux accords est refusé (409), manques nommés, rien n’est écrit', async () => {
    const { service, queries } = makeService({
      ...missionIn('draft'),
      'AS consultant_assigned': readyToStart['AS consultant_assigned'],
    })
    const error = await service
      .changeMissionStatus(WORKSPACE, USER, MISSION, { to: 'ready_to_start' })
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ConflictException)
    expect((error as ConflictException).getResponse()).toMatchObject({
      missing: ['client_agreement', 'consultant_agreement', 'contract_signed'],
    })
    expect(queries.some(q => q.sql.includes('UPDATE missions'))).toBe(false)
    expect(queries.some(q => q.sql.includes('INSERT INTO mission_status_transitions'))).toBe(false)
  })

  it('un SAUT d’étape est refusé (409), rien n’est écrit', async () => {
    const { service, queries } = makeService(missionIn('draft'))
    await expect(service.changeMissionStatus(WORKSPACE, USER, MISSION, { to: 'completed' })).rejects.toBeInstanceOf(
      ConflictException,
    )
    expect(queries.some(q => q.sql.includes('UPDATE missions'))).toBe(false)
  })

  it('un RETOUR ARRIÈRE sans motif est refusé (400) ; avec motif, il passe et le motif est journalisé', async () => {
    const without = makeService(missionIn('completed'))
    await expect(
      without.service.changeMissionStatus(WORKSPACE, USER, MISSION, { to: 'active' }),
    ).rejects.toBeInstanceOf(BadRequestException)

    const { service, queries } = makeService(missionIn('completed'))
    const result = await service.changeMissionStatus(WORKSPACE, USER, MISSION, {
      to: 'active',
      reason: 'Clôturée par erreur',
    })
    expect(result.direction).toBe('backward')
    const journal = queries.find(q => q.sql.includes('INSERT INTO mission_status_transitions'))
    expect(journal?.params[6]).toBe('backward')
    expect(journal?.params[7]).toBe('Clôturée par erreur')
  })

  it('un statut inconnu est refusé (400), une mission d’un autre espace introuvable (404)', async () => {
    const { service } = makeService(missionIn('active'))
    await expect(service.changeMissionStatus(WORKSPACE, USER, MISSION, { to: 'nope' })).rejects.toBeInstanceOf(
      BadRequestException,
    )
    const empty = makeService()
    await expect(empty.service.changeMissionStatus(WORKSPACE, USER, MISSION, { to: 'active' })).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })
})

// #2409.10 — annuler une mission AVANT son démarrage libère le consultant, sans second geste.
describe('MissionStatusService — #2409.10 annuler AVANT démarrage libère le consultant', () => {
  it('termine les affectations encore PLANIFIÉES/CONFIRMÉES quand la mission passe annulée depuis onboarding', async () => {
    const { service, queries } = makeService({
      ...missionIn('onboarding'),
      'FROM mission_assignments a': [
        { id: ASSIGNMENT, status: 'planned' },
        { id: 'a0000000-0000-4000-8000-000000000002', status: 'confirmed' },
      ],
    })
    await service.changeMissionStatus(WORKSPACE, USER, MISSION, { to: 'cancelled' })

    const updates = queries.filter(q => q.sql.includes('UPDATE mission_assignments'))
    expect(updates).toHaveLength(2)
    expect(updates[0]?.params).toEqual([ASSIGNMENT, MISSION, WORKSPACE])
    const journals = queries.filter(
      q => q.sql.includes('INSERT INTO mission_status_transitions') && q.params[3] === 'assignment',
    )
    expect(journals).toHaveLength(2)
    expect(journals[0]?.params).toEqual([
      WORKSPACE,
      MISSION,
      ASSIGNMENT,
      'assignment',
      'planned',
      'terminated',
      'forward',
      'Mission annulée avant démarrage — consultant libéré automatiquement.',
      USER,
    ])
  })

  it('ne touche aucune affectation déjà ACTIVE — l’annulation depuis "onboarding" ne peut en trouver, mais la clause le garantit', async () => {
    const { service, queries } = makeService({
      ...missionIn('ready_to_start'),
      'FROM mission_assignments a': [],
    })
    await service.changeMissionStatus(WORKSPACE, USER, MISSION, { to: 'cancelled' })
    const select = queries.find(q => q.sql.includes('FROM mission_assignments a'))
    expect(select?.sql).toContain("a.status IN ('planned','confirmed')")
    expect(queries.some(q => q.sql.includes('UPDATE mission_assignments'))).toBe(false)
  })

  it('une annulation depuis un statut EN COURS ne cascade rien (la mission a déjà démarré)', async () => {
    const { service, queries } = makeService(missionIn('at_risk'))
    await service.changeMissionStatus(WORKSPACE, USER, MISSION, { to: 'terminated', reason: 'Rupture client' })
    expect(queries.some(q => q.sql.includes('FROM mission_assignments a'))).toBe(false)
  })
})

describe('MissionStatusService — #2407.6 le statut de l’AFFECTATION, indépendant', () => {
  it('change le statut d’une affectation SANS toucher celui de la mission', async () => {
    const { service, queries } = makeService({ 'FROM mission_assignments a': [{ status: 'active' }] })
    const result = await service.changeAssignmentStatus(WORKSPACE, USER, MISSION, ASSIGNMENT, { to: 'replaced' })
    expect(result.direction).toBe('forward')
    expect(queries.some(q => q.sql.includes('UPDATE missions'))).toBe(false)
    const update = queries.find(q => q.sql.includes('UPDATE mission_assignments'))
    expect(update?.sql).toContain('m.workspace_id = $2')
    const journal = queries.find(q => q.sql.includes('INSERT INTO mission_status_transitions'))
    expect(journal?.params.slice(2, 4)).toEqual([ASSIGNMENT, 'assignment'])
  })
})

describe('MissionStatusService — #2407.3 la provenance des champs disputés', () => {
  it('rend la source et la date de la DERNIÈRE écriture des dates et du TJM, `null` si jamais modifié', async () => {
    const { service, queries } = makeService({
      'SELECT id FROM missions': [{ id: MISSION }],
      'FROM record_field_audit': [{ field: 'daily_rate', source: 'human', created_at: '2026-09-20T10:00:00Z' }],
    })
    const sources = await service.fieldSources(WORKSPACE, MISSION)
    expect(sources).toEqual({
      accountId: null,
      label: null,
      startedOn: null,
      endsOn: null,
      dailyRate: { source: 'human', at: '2026-09-20T10:00:00.000Z' },
    })
    expect(queries.find(q => q.sql.includes('FROM record_field_audit'))?.params).toEqual([
      WORKSPACE,
      MISSION,
      ['account_id', 'label', 'started_on', 'ends_on', 'daily_rate'],
    ])
  })

  /**
   * #2407.3 — RÉFUTÉ en prod le 23/09 : l'endpoint ne couvrait que dates + TJM.
   * `account_id` (le client) et `label` (l'intitulé) sont les deux autres
   * champs « principaux » que `DeliveryService.create` écrit désormais dans
   * `record_field_audit` (voir `mission-update.spec.ts`) — cette lecture doit
   * les rendre au même titre que les champs disputés historiques.
   */
  it('rend aussi la provenance du CLIENT et de l’INTITULÉ, écrite à la création', async () => {
    const { service } = makeService({
      'SELECT id FROM missions': [{ id: MISSION }],
      'FROM record_field_audit': [
        { field: 'account_id', source: 'human', created_at: '2026-09-01T08:00:00Z' },
        { field: 'label', source: 'human', created_at: '2026-09-01T08:00:00Z' },
      ],
    })
    const sources = await service.fieldSources(WORKSPACE, MISSION)
    expect(sources.accountId).toEqual({ source: 'human', at: '2026-09-01T08:00:00.000Z' })
    expect(sources.label).toEqual({ source: 'human', at: '2026-09-01T08:00:00.000Z' })
  })

  it('une mission d’un autre espace est introuvable', async () => {
    const { service } = makeService()
    await expect(service.fieldSources(WORKSPACE, MISSION)).rejects.toBeInstanceOf(NotFoundException)
  })
})
