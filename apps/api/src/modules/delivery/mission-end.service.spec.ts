import { ConflictException, NotFoundException } from '@nestjs/common'
import { MissionEndService } from './mission-end.service'

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'
const USER = 'u0000000-0000-4000-8000-000000000001'
const MISSION = 'm0000000-0000-4000-8000-000000000001'

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

const check = (item_key: string, confirmed_at = '2026-09-20T10:00:00Z') => ({
  item_key,
  note: 'transmis le 20/09',
  confirmed_by: USER,
  confirmed_at,
})

function service(routes: Routes) {
  const { manager, queries } = makeManager(routes)
  return { svc: new MissionEndService({ manager } as never), queries }
}

describe('MissionEndService — checklist de sortie (#2414.11-33)', () => {
  it('lit la checklist bornée à l’espace, non archivée', async () => {
    const { svc, queries } = service({
      'SELECT id FROM missions': [{ id: MISSION }],
      'FROM mission_end_checks': [check('client_handover')],
    })
    const r = await svc.checklist(WORKSPACE, MISSION)
    expect(r.verdict).toBe('in_progress')
    const q = queries.find(q => q.sql.includes('FROM mission_end_checks'))
    expect(q?.sql).toContain('archived_at IS NULL')
    expect(q?.params).toEqual([MISSION, WORKSPACE])
  })

  it('mission hors espace → 404', async () => {
    const { svc } = service({})
    await expect(svc.checklist(WORKSPACE, MISSION)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('confirmer un item ARCHIVE le geste précédent (jamais DELETE) puis écrit auteur + note', async () => {
    const { svc, queries } = service({ 'SELECT id FROM missions': [{ id: MISSION }] })
    await svc.confirmCheck(WORKSPACE, USER, MISSION, { item: 'client_handover', note: 'transmis le 20/09' })
    expect(queries.some(q => /DELETE/i.test(q.sql))).toBe(false)
    const archive = queries.findIndex(q => q.sql.includes('UPDATE mission_end_checks SET archived_at'))
    const insert = queries.findIndex(q => q.sql.includes('INSERT INTO mission_end_checks'))
    expect(archive).toBeGreaterThanOrEqual(0)
    expect(insert).toBeGreaterThan(archive)
    expect(queries[insert].params).toEqual([WORKSPACE, MISSION, 'client_handover', 'transmis le 20/09', USER])
  })

  it('retirer un item l’ARCHIVE, ne le supprime pas', async () => {
    const { svc, queries } = service({ 'SELECT id FROM missions': [{ id: MISSION }] })
    await svc.withdrawCheck(WORKSPACE, USER, MISSION, 'internal_equipment')
    expect(queries.some(q => /DELETE/i.test(q.sql))).toBe(false)
    const archive = queries.find(q => q.sql.includes('UPDATE mission_end_checks SET archived_at'))
    expect(archive?.params).toEqual([MISSION, WORKSPACE, 'internal_equipment', USER])
  })
})

describe('MissionEndService — motif typé (#2414.1-8)', () => {
  it('écrit le motif dans missions.end_reason', async () => {
    const { svc, queries } = service({ 'SELECT id FROM missions': [{ id: MISSION }] })
    await svc.setEndReason(WORKSPACE, MISSION, { reason: 'renouvellement_refuse' })
    const update = queries.find(q => q.sql.includes('SET end_reason'))
    expect(update?.params).toEqual(['renouvellement_refuse', MISSION, WORKSPACE])
  })

  it('mission hors espace → 404', async () => {
    const { svc } = service({})
    await expect(svc.setEndReason(WORKSPACE, MISSION, { reason: 'demission' })).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })
})

describe('MissionEndService — mission interrompue, NO-GO (#2414.54-59)', () => {
  it('déclare une interruption SANS jamais écrire de disponibilité confirmée', async () => {
    const { svc, queries } = service({ 'SELECT id FROM missions': [{ id: MISSION }] })
    await svc.declareInterruption(WORKSPACE, USER, MISSION, {
      responsibility: 'client',
      risk: 'moyen',
      confidentialityAcknowledged: true,
      nonSolicitationAcknowledged: true,
      note: 'Le client a mis fin au contrat après un désaccord sur le périmètre.',
    })
    const insert = queries.find(q => q.sql.includes('INSERT INTO mission_interruptions'))
    expect(insert).toBeDefined()
    expect(insert?.sql).not.toMatch(/availability_confirmed\s*=/)
    expect(insert?.sql).toContain('availability_confirmed')
    // le motif de fin de la mission bascule sur 'interruption', en fin d'énumération pour la mission.
    const reason = queries.find(q => q.sql.includes('SET end_reason'))
    expect(reason?.params).toEqual(['interruption', MISSION, WORKSPACE])
  })

  it('une interruption existante REFUSE une seconde déclaration (une ligne par mission)', async () => {
    const { svc } = service({
      'SELECT id FROM missions': [{ id: MISSION }],
      'FROM mission_interruptions': [{ id: 'x' }],
    })
    await expect(
      svc.declareInterruption(WORKSPACE, USER, MISSION, {
        responsibility: 'client',
        risk: 'moyen',
        confidentialityAcknowledged: true,
        nonSolicitationAcknowledged: true,
        note: 'Une deuxième déclaration ne doit jamais être acceptée pour la même mission.',
      }),
    ).rejects.toBeInstanceOf(ConflictException)
  })

  it('la revalidation de disponibilité est un SECOND geste, distinct de la déclaration', async () => {
    const { svc, queries } = service({
      'SELECT id FROM missions': [{ id: MISSION }],
      'FROM mission_interruptions': [{ id: 'int-1', availability_confirmed: false }],
    })
    await svc.confirmAvailability(WORKSPACE, USER, MISSION)
    const update = queries.find(q => q.sql.includes('SET availability_confirmed = true'))
    expect(update?.params).toEqual([USER, MISSION, WORKSPACE])
  })

  it('revalider sans interruption déclarée au préalable → 404', async () => {
    const { svc } = service({ 'SELECT id FROM missions': [{ id: MISSION }] })
    await expect(svc.confirmAvailability(WORKSPACE, USER, MISSION)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('lit l’interruption déclarée, bornée à l’espace', async () => {
    const { svc, queries } = service({
      'SELECT id FROM missions': [{ id: MISSION }],
      'FROM mission_interruptions': [
        {
          id: 'int-1',
          mission_id: MISSION,
          responsibility: 'client',
          risk: 'moyen',
          confidentiality_acknowledged: true,
          non_solicitation_acknowledged: true,
          note: 'Le client a mis fin au contrat.',
          availability_confirmed: false,
          availability_confirmed_by: null,
          availability_confirmed_at: null,
          declared_by: USER,
          declared_at: '2026-09-20T10:00:00Z',
        },
      ],
    })
    const r = await svc.readInterruption(WORKSPACE, MISSION)
    expect(r).toMatchObject({ responsibility: 'client', risk: 'moyen', availabilityConfirmed: false })
    const q = queries.find(q => q.sql.includes('FROM mission_interruptions'))
    expect(q?.params).toEqual([MISSION, WORKSPACE])
  })

  it('aucune interruption déclarée → null (jamais devinée)', async () => {
    const { svc } = service({ 'SELECT id FROM missions': [{ id: MISSION }] })
    expect(await svc.readInterruption(WORKSPACE, MISSION)).toBeNull()
  })
})
