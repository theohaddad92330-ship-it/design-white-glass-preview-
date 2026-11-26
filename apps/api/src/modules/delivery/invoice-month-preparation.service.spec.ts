import { ConflictException, NotFoundException } from '@nestjs/common'
import { InvoiceMonthPreparationService, isFirstWorkingDayOfMonth } from './invoice-month-preparation.service'

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'
const USER = 'u0000000-0000-4000-8000-000000000001'
const MISSION = 'm0000000-0000-4000-8000-000000000001'

function item(over: Record<string, unknown> = {}) {
  return {
    missionId: MISSION,
    missionLabel: 'Renfort plateforme',
    accountId: 'a0000000-0000-4000-8000-000000000001',
    accountName: 'ACME',
    periodMonth: '2026-09-01',
    state: 'ready',
    days: 20,
    daysSource: 'cra',
    dailyRateCents: 65000,
    poNumber: 'BC-1',
    invoiceReference: null,
    ...over,
  }
}

function makeService(opts: {
  current?: Record<string, unknown> | null
  previous?: Record<string, unknown> | null
  terms?: Record<string, unknown> | null
  consumed?: { cra: string | null; manual: string | null }
  prepared?: boolean
  auto?: boolean
}) {
  const queries: { sql: string; params: unknown[] }[] = []
  const manager = {
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params })
      if (sql.includes('FROM mission_commercial_terms')) return opts.terms === null ? [] : [opts.terms ?? {}]
      if (sql.includes('SUM(ts.days)')) return [opts.consumed ?? { cra: null, manual: null }]
      if (sql.includes('SELECT prepared_at')) return opts.prepared ? [{ prepared_at: '2026-10-01T06:40:00Z' }] : []
      if (sql.includes('FROM mission_invoice_auto_prepare')) return opts.auto ? [{ mission_id: MISSION }] : []
      if (sql.includes('FROM missions WHERE id')) return [{ id: MISSION }]
      return []
    }),
  }
  const list = jest.fn(async (_w: string, query: { month: string }) => {
    const row = query.month === '2026-09' ? opts.current : opts.previous
    return { items: row === null || row === undefined ? [] : [row] }
  })
  const service = new InvoiceMonthPreparationService({ manager } as never, { list } as never)
  return { service, queries, manager }
}

describe('InvoiceMonthPreparationService — la facture reconduite (#2563, #2566)', () => {
  it('pré-remplit depuis le mois précédent et chiffre jours × TJM', async () => {
    const { service } = makeService({
      current: item(),
      previous: item({ periodMonth: '2026-08-01', days: 18, invoiceReference: 'FA-0042' }),
      terms: {
        requires_po: true,
        po_number: 'BC-1',
        po_issued_on: '2026-01-01',
        po_valid_until: '2026-12-31',
        po_volume_days: '100',
      },
      consumed: { cra: '40', manual: null },
    })
    const out = await service.preview(WORKSPACE, MISSION, '2026-09')
    expect(out.previous).toEqual({ periodMonth: '2026-08-01', days: 18, invoiceReference: 'FA-0042' })
    expect(out.days).toBe(20)
    expect(out.amountCents).toBe(20 * 65000)
    expect(out.poCheck.remainingDays).toBe(60)
    expect(out.poCheck.remainingAfterDays).toBe(40)
    expect(out.poCheck.alerts).toEqual([])
    expect(out.prepared).toBe(false)
  })

  it('alerte le dépassement du volume du bon de commande sans empêcher de préparer', async () => {
    const { service } = makeService({
      current: item({ days: 20 }),
      terms: { requires_po: true, po_number: 'BC-1', po_issued_on: null, po_valid_until: null, po_volume_days: '100' },
      consumed: { cra: '90', manual: null },
    })
    const out = await service.preview(WORKSPACE, MISSION, '2026-09')
    expect(out.poCheck.alerts).toEqual(['po_volume_exceeded'])
    expect(out.poCheck.remainingAfterDays).toBe(-10)
  })

  it('alerte la période hors validité et un bon absent', async () => {
    const { service } = makeService({
      current: item({ poNumber: null }),
      terms: {
        requires_po: true,
        po_number: null,
        po_issued_on: null,
        po_valid_until: '2026-08-31',
        po_volume_days: null,
      },
    })
    const out = await service.preview(WORKSPACE, MISSION, '2026-09')
    expect(out.poCheck.alerts).toEqual(['po_missing', 'po_expired'])
    expect(out.poCheck.remainingDays).toBeNull()
  })

  it('sans consommation mesurée, ne montre aucun reste (jamais 0)', async () => {
    const { service } = makeService({
      current: item(),
      terms: { requires_po: false, po_number: null, po_issued_on: null, po_valid_until: null, po_volume_days: '100' },
    })
    const out = await service.preview(WORKSPACE, MISSION, '2026-09')
    expect(out.poCheck.remainingDays).toBeNull()
  })

  it('une mission sans ligne ce mois-là est introuvable, jamais devinée', async () => {
    const { service } = makeService({ current: null })
    await expect(service.preview(WORKSPACE, MISSION, '2026-09')).rejects.toBeInstanceOf(NotFoundException)
  })

  it('refuse de préparer un mois déjà facturé', async () => {
    const { service } = makeService({ current: item({ state: 'invoiced_declared' }) })
    await expect(service.save(WORKSPACE, USER, MISSION, '2026-09', { days: 19 })).rejects.toBeInstanceOf(
      ConflictException,
    )
  })

  it('enregistre les jours saisis et le N° de BC, scopés à l’espace', async () => {
    const { service, queries } = makeService({ current: item() })
    await service.save(WORKSPACE, USER, MISSION, '2026-09', { days: 19, poNumber: 'BC-9' })
    const write = queries.find(q => q.sql.includes('INSERT INTO mission_month_preparations'))
    expect(write?.params).toEqual([WORKSPACE, MISSION, '2026-09-01', 19, 'BC-9', USER, true, true])
  })

  it('un champ absent reste inchangé (drapeaux d’écriture à faux)', async () => {
    const { service, queries } = makeService({ current: item() })
    await service.save(WORKSPACE, USER, MISSION, '2026-09', { days: 19 })
    const write = queries.find(q => q.sql.includes('INSERT INTO mission_month_preparations'))
    expect(write?.params.slice(-2)).toEqual([true, false])
  })

  it('l’option automatique s’active et se retire', async () => {
    const { service, queries } = makeService({ current: item() })
    await service.setAutoPrepare(WORKSPACE, USER, MISSION, true)
    expect(queries.some(q => q.sql.includes('INSERT INTO mission_invoice_auto_prepare'))).toBe(true)
    await service.setAutoPrepare(WORKSPACE, USER, MISSION, false)
    expect(queries.some(q => q.sql.includes('DELETE FROM mission_invoice_auto_prepare'))).toBe(true)
  })

  it('le balayage ne prépare QUE le premier jour ouvré, et le mois écoulé', async () => {
    const { service, manager } = makeService({ current: item() })
    expect(await service.prepareDueMonths(new Date('2026-10-02T06:40:00Z'))).toBe(0)
    expect(manager.query).not.toHaveBeenCalled()
    await service.prepareDueMonths(new Date('2026-10-01T06:40:00Z'))
    expect(manager.query.mock.calls[0]?.[1]).toEqual(['2026-09-01'])
  })
})

describe('isFirstWorkingDayOfMonth', () => {
  it.each([
    ['2026-10-01', true], // jeudi
    ['2026-10-02', false],
    ['2026-11-01', false], // dimanche
    ['2026-11-02', true], // lundi : le premier jour ouvré
    ['2026-11-03', false],
    ['2026-08-03', true], // le 1er août est un samedi : le lundi 3
    ['2026-08-01', false],
  ])('%s -> %s', (day, expected) => {
    expect(isFirstWorkingDayOfMonth(new Date(`${day}T06:40:00Z`))).toBe(expected)
  })
})
