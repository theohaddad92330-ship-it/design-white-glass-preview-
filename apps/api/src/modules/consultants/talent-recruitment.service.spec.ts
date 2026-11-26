import { NotFoundException } from '@nestjs/common'
import type { Repository } from 'typeorm'
import type { TalentRecruitmentEventEntity } from '../../database/entities/talent-recruitment-event.entity'
import { TalentRecruitmentService } from './talent-recruitment.service'

const WS = 'w0000000-0000-4000-8000-000000000001'
const USER = 'u0000000-0000-4000-8000-000000000001'
const T1 = 'a0000000-0000-4000-8000-00000000000a'

function makeService(opts: { known?: boolean; board?: unknown[]; history?: unknown[] } = {}) {
  const calls: { sql: string; params: unknown[] }[] = []
  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params })
    if (sql.includes('FROM talent_recruitment_events e') && sql.includes('FROM consultants c')) return opts.board ?? []
    if (sql.startsWith('SELECT id FROM consultants')) return opts.known === false ? [] : [{ id: T1 }]
    if (sql.startsWith('INSERT INTO talent_recruitment_events'))
      return [{ id: 'e1', created_at: '2026-10-22T10:00:00.000Z' }]
    if (sql.includes('FROM talent_recruitment_events e')) return opts.history ?? []
    return []
  })
  const events = { manager: { query } } as unknown as Repository<TalentRecruitmentEventEntity>
  return { service: new TalentRecruitmentService(events), calls }
}

describe('TalentRecruitmentService — Théo C talents-recrutement', () => {
  it('N1 — le kanban lit les personnes de l’ESPACE, archivées exclues, et ne touche ni présentations ni affectations', async () => {
    const { service, calls } = makeService()
    await service.board(WS)
    const sql = calls[0]?.sql ?? ''
    expect(calls[0]?.params).toEqual([WS])
    expect(sql).toContain('c.workspace_id = $1')
    expect(sql).toContain('c.archived_at IS NULL')
    expect(sql).not.toMatch(/submissions|mission_assignments|shortlist/i)
  })

  it('N1 — une personne jamais rangée est « À qualifier » ; les cinq colonnes sortent même vides', async () => {
    const { service } = makeService({
      board: [
        {
          id: T1,
          full_name: 'Sophie Ledran',
          title: 'Architecte SAP',
          location: 'Lyon',
          engagement_kind: 'freelance',
          stage: null,
          stage_since: null,
          reason: null,
          planned_at: null,
        },
      ],
    })
    const columns = await service.boardColumns(WS)
    expect(columns.map(column => column.cards.length)).toEqual([1, 0, 0, 0, 0])
    expect(columns[0]?.cards[0]).toMatchObject({ stage: 'to_qualify', stageSince: null, relation: 'freelance' })
  })

  it('une relation inconnue n’est pas affichée comme une relation', async () => {
    const { service } = makeService({
      board: [
        {
          id: T1,
          full_name: 'X',
          title: null,
          location: null,
          engagement_kind: 'inconnu',
          stage: null,
          stage_since: null,
          reason: null,
          planned_at: null,
        },
      ],
    })
    const [first] = await service.boardColumns(WS)
    expect(first?.cards[0]?.relation).toBeNull()
  })

  it('N2 — changer d’étape AJOUTE une ligne au journal (jamais de réécriture) avec le motif', async () => {
    const { service, calls } = makeService()
    await service.change(WS, USER, T1, { stage: 'on_hold', reason: 'Repasse en janvier' })
    const insert = calls.find(call => call.sql.startsWith('INSERT INTO talent_recruitment_events'))
    expect(insert?.params).toEqual([WS, T1, 'on_hold', 'Repasse en janvier', null, USER])
    expect(calls.some(call => /^(UPDATE|DELETE)/.test(call.sql))).toBe(false)
  })

  it('refuse une personne d’un AUTRE espace', async () => {
    const { service, calls } = makeService({ known: false })
    await expect(service.change(WS, USER, T1, { stage: 'qualified' })).rejects.toBeInstanceOf(NotFoundException)
    expect(calls.some(call => call.sql.startsWith('INSERT'))).toBe(false)
    expect(calls[0]?.params).toEqual([T1, WS])
  })

  it('N2 — l’historique d’une personne est lu dans son espace, du plus récent au plus ancien', async () => {
    const { service, calls } = makeService({
      history: [
        {
          id: 'e2',
          stage: 'qualified',
          reason: null,
          planned_at: null,
          changed_by_name: 'Louis',
          created_at: '2026-10-22T10:00:00.000Z',
        },
      ],
    })
    const history = await service.history(WS, T1)
    expect(history[0]).toMatchObject({ stage: 'qualified', changedByName: 'Louis' })
    expect(calls[0]?.sql).toContain('e.workspace_id = $1')
    expect(calls[0]?.sql).toContain('ORDER BY e.created_at DESC')
  })
})
