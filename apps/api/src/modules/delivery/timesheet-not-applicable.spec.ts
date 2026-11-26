import { BadRequestException, NotFoundException } from '@nestjs/common'
import { TimesheetsService } from './timesheets.service'

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'
const USER = 'u0000000-0000-4000-8000-000000000001'
const MISSION = 'a0000000-0000-4000-8000-000000000001'
const CONSULTANT = 'c0000000-0000-4000-8000-000000000001'
const EXCEPTION = 'e0000000-0000-4000-8000-000000000001'

/**
 * #2196.31 — « Marquer non applicable » / « Annuler » (décision Louis 19/09).
 *
 * Une EXCEPTION TRACÉE (qui, quand, pourquoi — motif obligatoire), réversible,
 * qui prime sur la déduction du contrat pour CE mois seulement. L'annulation
 * RÉVOQUE, elle ne supprime jamais.
 */
type Row = Record<string, unknown>

function craRow(over: Row = {}): Row {
  return {
    mission_id: MISSION,
    mission_label: 'Run plateforme',
    account_name: 'ACME',
    contract_kind: 'regie',
    started_on: null,
    ends_on: null,
    consultant_id: CONSULTANT,
    consultant_name: 'A. Dupont',
    ts_id: null,
    ts_days: null,
    ts_status: null,
    ts_expected: null,
    ts_explanation: null,
    ts_validated_client: null,
    ts_approver_name: null,
    ts_approver_email: null,
    ts_anomalies: null,
    ts_reminders: null,
    ts_last_reminder: null,
    ts_rejected_at: null,
    ts_rejection_reason: null,
    na_id: null,
    na_reason: null,
    na_created_at: null,
    na_marked_by: null,
    ...over,
  }
}

function makeService(rows: Row[], updated: unknown = [[], 0]) {
  const queries: { sql: string; params: unknown[] }[] = []
  const manager = {
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params })
      if (sql.includes('INSERT INTO mission_timesheet_exceptions')) {
        return [{ id: EXCEPTION, created_at: new Date('2026-08-03T09:00:00Z'), account_id: 'acc-1' }]
      }
      if (sql.includes('UPDATE mission_timesheet_exceptions')) return updated
      if (sql.includes('FROM missions m')) return rows
      return []
    }),
  }
  const service = new TimesheetsService({ manager } as never)
  const inserts = () => queries.filter(q => q.sql.includes('INSERT INTO mission_timesheet_exceptions'))
  return { service, queries, manager, inserts }
}

const NOW = new Date('2026-08-21T10:00:00Z')
const input = (over: Partial<{ reason: string; consultantId: string | null }> = {}) => ({
  missionId: MISSION,
  month: '2026-07',
  consultantId: CONSULTANT,
  reason: 'Congé sans solde tout le mois',
  ...over,
})

describe('TimesheetsService.markNotApplicable (#2196.31)', () => {
  it('refuse un motif vide AVANT la base — le motif est obligatoire côté serveur', async () => {
    const { service, manager } = makeService([craRow()])
    await expect(service.markNotApplicable(WORKSPACE, USER, input({ reason: '   ' }), NOW)).rejects.toBeInstanceOf(
      BadRequestException,
    )
    expect(manager.query).not.toHaveBeenCalled()
  })

  it('pose l’exception sur un mois MANQUANT : qui, quand, pourquoi, bornée à l’espace', async () => {
    const { service, inserts } = makeService([craRow()])
    const trace = await service.markNotApplicable(WORKSPACE, USER, input({ reason: '  Congé sans solde  ' }), NOW)

    expect(inserts()).toHaveLength(1)
    expect(inserts()[0]?.params).toEqual([WORKSPACE, MISSION, CONSULTANT, '2026-07-01', 'Congé sans solde', USER])
    expect(trace).toMatchObject({
      id: EXCEPTION,
      accountId: 'acc-1',
      missionLabel: 'Run plateforme',
      periodMonth: '2026-07-01',
      reason: 'Congé sans solde',
    })
  })

  it('refuse un relevé DÉPOSÉ — un fait ne se cache pas derrière une exception', async () => {
    const { service, inserts } = makeService([craRow({ ts_id: 't-1', ts_status: 'submitted', ts_days: 18 })])
    await expect(service.markNotApplicable(WORKSPACE, USER, input(), NOW)).rejects.toBeInstanceOf(BadRequestException)
    expect(inserts()).toHaveLength(0)
  })

  it('refuse un mois déjà marqué — une seule exception active par maille', async () => {
    const { service, inserts } = makeService([
      craRow({ na_id: EXCEPTION, na_reason: 'déjà', na_created_at: new Date(), na_marked_by: 'L. Martin' }),
    ])
    await expect(service.markNotApplicable(WORKSPACE, USER, input(), NOW)).rejects.toBeInstanceOf(BadRequestException)
    expect(inserts()).toHaveLength(0)
  })

  it('refuse un forfait — il n’attend déjà aucun relevé', async () => {
    const { service, inserts } = makeService([craRow({ contract_kind: 'forfait' })])
    await expect(service.markNotApplicable(WORKSPACE, USER, input(), NOW)).rejects.toBeInstanceOf(BadRequestException)
    expect(inserts()).toHaveLength(0)
  })

  it('rend 404 quand la maille n’existe pas dans cet espace', async () => {
    const { service } = makeService([])
    await expect(service.markNotApplicable(WORKSPACE, USER, input(), NOW)).rejects.toBeInstanceOf(NotFoundException)
  })
})

describe('TimesheetsService.month — l’exception voyage avec la ligne (#2196.31)', () => {
  it('lit l’exception ACTIVE : statut non requis, trace qui/quand/pourquoi', async () => {
    const { service, queries } = makeService([
      craRow({
        na_id: EXCEPTION,
        na_reason: 'Congé sans solde',
        na_created_at: new Date('2026-08-03T09:00:00Z'),
        na_marked_by: 'Louise Martin',
      }),
    ])
    const { items } = await service.month(WORKSPACE, { month: '2026-07' }, NOW)

    expect(items[0]?.status).toBe('not_required')
    expect(items[0]?.notApplicable).toEqual({
      id: EXCEPTION,
      reason: 'Congé sans solde',
      markedAt: '2026-08-03T09:00:00.000Z',
      markedByName: 'Louise Martin',
    })
    // Seule l'exception VIVANTE compte : une révoquée ne prime plus.
    expect(queries[0]?.sql).toContain('x.revoked_at IS NULL')
  })
})

describe('TimesheetsService.revokeNotApplicable (#2196.31)', () => {
  it('RÉVOQUE (date, auteur) — jamais un DELETE : on archive, on ne supprime pas', async () => {
    const revoked = {
      id: EXCEPTION,
      mission_id: MISSION,
      mission_label: 'Run plateforme',
      account_id: 'acc-1',
      period_month: '2026-07-01',
      reason: 'Congé sans solde',
      revoked_at: new Date('2026-08-04T09:00:00Z'),
    }
    const { service, queries } = makeService([], [[revoked], 1])
    const trace = await service.revokeNotApplicable(WORKSPACE, USER, EXCEPTION)

    const sql = queries.map(q => q.sql).join('\n')
    expect(sql).not.toMatch(/DELETE/i)
    expect(sql).toContain('SET revoked_at = now(), revoked_by = $3')
    expect(sql).toContain('x.revoked_at IS NULL')
    expect(queries[0]?.params).toEqual([EXCEPTION, WORKSPACE, USER])
    expect(trace).toMatchObject({ id: EXCEPTION, accountId: 'acc-1', periodMonth: '2026-07-01' })
  })

  it('rend 404 sur une exception inconnue, d’un autre espace ou déjà annulée', async () => {
    const { service } = makeService([], [[], 0])
    await expect(service.revokeNotApplicable(WORKSPACE, USER, EXCEPTION)).rejects.toBeInstanceOf(NotFoundException)
  })
})
