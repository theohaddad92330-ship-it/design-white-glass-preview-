import { FORECAST_CATEGORIES } from '@bellum/contracts'
import { PipeService } from './pipe.service'

const NOW = new Date('2026-10-14T10:00:00.000Z')
const WS = 'ws-1'

type Call = { sql: string; params: unknown[] }

function setup(tables: Record<string, unknown[]>): { service: PipeService; calls: Call[] } {
  const calls: Call[] = []
  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params })
    if (sql.includes('FROM opportunity_field_changes')) return tables.changes ?? []
    if (sql.includes('FROM commercial_transitions')) return tables.transitions ?? []
    if (sql.includes('FROM activities')) return tables.activities ?? []
    if (sql.includes('FROM opportunities')) return tables.opportunities ?? []
    return []
  })
  const service = new PipeService({ manager: { query } } as never)
  return { service, calls }
}

const row = (over: Record<string, unknown>) => ({
  id: '11111111-1111-4111-8111-111111111111',
  account_id: '22222222-2222-4222-8222-222222222222',
  company_name: 'Société Générale',
  label: 'TMA applicative',
  stage: 'negotiation',
  stage_entered_at: '2026-09-14T10:00:00.000Z',
  amount_cents: '120000',
  currency: 'EUR',
  expected_close_on: '2026-10-02',
  forecast_category: null,
  owner_id: '33333333-3333-4333-8333-333333333333',
  owner_name: 'Camille Durand',
  first_detected_at: '2026-06-01T10:00:00.000Z',
  closed_at: null,
  outcome: null,
  ...over,
})

describe('PipeService', () => {
  it('chaque requête est scopée au workspace', async () => {
    const { service, calls } = setup({ opportunities: [row({})] })
    await service.inspection(WS, NOW)
    await service.waterfall(WS, undefined, undefined, NOW)
    await service.byOwner(WS, undefined, undefined, NOW)
    expect(calls.length).toBeGreaterThan(5)
    for (const call of calls) {
      expect(call.params[0]).toBe(WS)
      expect(call.sql).toMatch(/workspace_id = \$1/)
    }
  })

  it("Théo D pilotage.A11 — avec un propriétaire, l'inspection et le waterfall ne portent que SES affaires", async () => {
    const mine = row({ id: 'a1111111-1111-4111-8111-111111111111', owner_id: 'u-me', amount_cents: '100000' })
    const theirs = row({ id: 'b1111111-1111-4111-8111-111111111111', owner_id: 'u-other', amount_cents: '900000' })
    const { service } = setup({ opportunities: [mine, theirs] })
    const own = await service.inspection(WS, NOW, 'u-me')
    expect(own.rows.map(r => r.id)).toEqual([mine.id])
    const all = await service.inspection(WS, NOW)
    expect(all.rows).toHaveLength(2)
    const waterfall = await service.waterfall(WS, undefined, undefined, NOW, 'u-me')
    expect(waterfall.closingCount).toBe(1)
  })

  it("l'inspection ne montre que les ouvertes, avec totaux par catégorie NON pondérés et « non déclarée »", async () => {
    const { service } = setup({
      opportunities: [
        row({ id: 'a1111111-1111-4111-8111-111111111111', forecast_category: 'commit', amount_cents: '100000' }),
        row({ id: 'b1111111-1111-4111-8111-111111111111', forecast_category: 'commit', amount_cents: null }),
        row({ id: 'c1111111-1111-4111-8111-111111111111', forecast_category: null, amount_cents: '5000' }),
        row({
          id: 'd1111111-1111-4111-8111-111111111111',
          stage: 'won',
          outcome: 'won',
          closed_at: '2026-10-01T10:00:00Z',
        }),
        row({ id: 'e1111111-1111-4111-8111-111111111111', forecast_category: 'omitted', currency: 'USD' }),
      ],
    })
    const inspection = await service.inspection(WS, NOW)
    expect(inspection.rows).toHaveLength(4)
    const commit = inspection.totals.find(t => t.category === 'commit')
    expect(commit).toEqual({ category: 'commit', count: 2, amountCents: 100000, withoutAmount: 1 })
    expect(inspection.totals.find(t => t.category === null)).toMatchObject({ count: 1, amountCents: 5000 })
    // hors euro : jamais additionné à des euros, nommé « sans montant »
    expect(inspection.totals.find(t => t.category === 'omitted')).toMatchObject({ amountCents: 0, withoutAmount: 1 })
    // aucune catégorie vide ne fait de ligne
    expect(inspection.totals.some(t => t.count === 0)).toBe(false)
    for (const total of inspection.totals) {
      if (total.category !== null) expect(FORECAST_CATEGORIES).toContain(total.category)
    }
  })

  it('les signaux disent leur fait : date dépassée de 12 j, aucune activité de 30 j', async () => {
    const { service } = setup({
      opportunities: [row({})],
      activities: [{ project_id: '11111111-1111-4111-8111-111111111111', last_at: '2026-09-14T10:00:00.000Z' }],
    })
    const [first] = (await service.inspection(WS, NOW)).rows
    expect(first?.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'close_overdue', days: 12 }),
        expect.objectContaining({ kind: 'no_activity', days: 30 }),
      ]),
    )
  })

  it('« repoussée ≥ 2 fois » se lit dans le journal, une avance ne compte pas', async () => {
    const id = '11111111-1111-4111-8111-111111111111'
    const { service } = setup({
      opportunities: [row({ expected_close_on: '2026-12-01' })],
      changes: [
        {
          opportunity_id: id,
          field: 'expected_close_on',
          from_value: '2026-09-01',
          to_value: '2026-10-01',
          occurred_at: '2026-09-20T00:00:00Z',
        },
        {
          opportunity_id: id,
          field: 'expected_close_on',
          from_value: '2026-10-01',
          to_value: '2026-11-01',
          occurred_at: '2026-10-05T00:00:00Z',
        },
        {
          opportunity_id: id,
          field: 'expected_close_on',
          from_value: '2026-11-01',
          to_value: '2026-10-20',
          occurred_at: '2026-10-06T00:00:00Z',
        },
        {
          opportunity_id: id,
          field: 'expected_close_on',
          from_value: '2026-10-20',
          to_value: '2026-12-01',
          occurred_at: '2026-10-07T00:00:00Z',
        },
      ],
    })
    const [first] = (await service.inspection(WS, NOW)).rows
    expect(first?.signals).toContainEqual(expect.objectContaining({ kind: 'close_pushed', count: 3 }))
  })

  it('le waterfall par défaut va du début du mois courant à maintenant', async () => {
    const { service } = setup({ opportunities: [] })
    const w = await service.waterfall(WS, undefined, undefined, NOW)
    expect(w.from).toBe('2026-10-01T00:00:00.000Z')
    expect(w.to).toBe(NOW.toISOString())
    expect(w.unexplainedCents).toBe(0)
  })

  it('par commercial : le nom vient du profil, le dénominateur du taux est rendu', async () => {
    const { service } = setup({ opportunities: [row({})] })
    const { owners } = await service.byOwner(WS, undefined, undefined, NOW)
    expect(owners[0]).toMatchObject({ ownerName: 'Camille Durand', openCount: 1, openCents: 120000, winRateDays: 90 })
  })
})
