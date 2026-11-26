import type { DataSource } from 'typeorm'
import { WeekDeltaService } from './week-delta.service'

const WS = 'ws-1'
const NOW = new Date('2026-10-14T10:00:00Z')

type Route = (params: unknown[]) => unknown[] | Promise<unknown[]>
type Routes = Partial<Record<'created' | 'transitions' | 'missions' | 'cash' | 'target' | 'realised' | 'pipe', Route>>

const KEYS: [keyof Routes, string][] = [
  ['created', 'first_detected_at'],
  ['transitions', 'FROM commercial_transitions'],
  ['missions', 'FROM missions'],
  ['cash', 'FROM invoice_readiness'],
  ['target', 'FROM member_objectives'],
  ['realised', "o.stage = 'won'"],
  ['pipe', 'o.stage = ANY'],
]

function build(routes: Routes) {
  const query = jest.fn(async (sql: string, params: unknown[]) => {
    const hit = KEYS.find(([, needle]) => sql.includes(needle))
    const route = hit ? routes[hit[0]] : undefined
    if (!route) return []
    return route(params)
  })
  return { service: new WeekDeltaService({ query } as unknown as DataSource), query }
}

const move = (id: string, from: string | null, to: string, amount: string | null = '1000') => ({
  id,
  label: `Besoin ${id}`,
  account_name: 'Société Générale',
  amount,
  from_state: from,
  to_state: to,
})

describe('WeekDeltaService.weekDelta', () => {
  it('par défaut : les 7 derniers jours glissants', async () => {
    const { service, query } = build({})
    const out = await service.weekDelta(WS, {}, NOW)
    expect(out.period).toEqual({ from: '2026-10-07T10:00:00.000Z', to: '2026-10-14T10:00:00.000Z' })
    expect(out.generatedAt).toBe(NOW.toISOString())
    const dated = query.mock.calls.find(([sql]) => sql.includes('FROM commercial_transitions'))
    expect(dated?.[1]).toEqual([WS, out.period.from, out.period.to])
  })

  it('classe avancée / reculée / perdue / signée selon l’ordre des stades du pipe', async () => {
    const { service } = build({
      transitions: () => [
        move('a', 'confirmed', 'qualified', '1000'),
        move('b', 'confirmed', 'profiles_submitted', '500'),
        move('c', 'negotiation', 'confirmed', '700'),
        move('d', 'negotiation', 'won', '9000'),
        move('e', 'confirmed', 'lost', '300'),
        move('f', null, 'detected', null),
        move('g', 'qualified', 'dormant', '10'),
        // #4338.1 — Qualifié → Besoin exprimé est désormais un RECUL.
        move('h', 'qualified', 'confirmed', '40'),
      ],
    })
    const out = await service.weekDelta(WS, {}, NOW)
    expect(out.advanced).toMatchObject({ count: 2, amount: 1500 })
    expect(out.regressed).toMatchObject({ count: 2, amount: 740 })
    expect(out.won).toMatchObject({ count: 1, amount: 9000 })
    expect(out.lost).toMatchObject({ count: 1, amount: 300 })
    expect(out.advanced?.lines[0]).toMatchObject({
      id: 'a',
      accountName: 'Société Générale',
      from: 'confirmed',
      to: 'qualified',
    })
  })

  it('une source mesurée et vide vaut 0 ; une somme sans aucun montant saisi vaut null', async () => {
    const { service } = build({ transitions: () => [move('a', 'confirmed', 'qualified', null)] })
    const out = await service.weekDelta(WS, {}, NOW)
    expect(out.advanced).toEqual({ count: 1, amount: null, lines: [expect.objectContaining({ amount: null })] })
    expect(out.regressed).toEqual({ count: 0, amount: 0, lines: [] })
    expect(out.missionsEnding).toEqual({ count: 0, horizonDays: 30, lines: [] })
    expect(out.cashIn).toEqual({ count: 0, amountCents: 0, lines: [] })
  })

  it('une source illisible vaut null — jamais 0 — et n’emporte pas les autres', async () => {
    const { service } = build({
      transitions: () => {
        throw new Error('boom')
      },
      missions: () => [{ id: 'm1', consultant_name: 'Julie Martin', account_name: 'Airbus', ends_on: '2026-10-30' }],
    })
    const out = await service.weekDelta(WS, {}, NOW)
    expect(out.advanced).toBeNull()
    expect(out.regressed).toBeNull()
    expect(out.lost).toBeNull()
    expect(out.won).toBeNull()
    expect(out.created).toEqual({ count: 0, amount: 0, lines: [] })
    expect(out.missionsEnding).toEqual({
      count: 1,
      horizonDays: 30,
      lines: [{ id: 'm1', consultantName: 'Julie Martin', accountName: 'Airbus', endsOn: '2026-10-30' }],
    })
  })

  it('plafonne les lignes à 20 sans tronquer le compte ni la somme', async () => {
    const rows = Array.from({ length: 25 }, (_, i) => move(`x${i}`, 'confirmed', 'qualified', '100'))
    const { service } = build({ transitions: () => rows })
    const out = await service.weekDelta(WS, {}, NOW)
    expect(out.advanced?.count).toBe(25)
    expect(out.advanced?.amount).toBe(2500)
    expect(out.advanced?.lines).toHaveLength(20)
  })

  it('encaissements groupés par client', async () => {
    const { service } = build({
      cash: () => [
        { account_id: 'a1', account_name: 'Airbus', amount_cents: '500000', n: '2' },
        { account_id: 'a2', account_name: 'Orange', amount_cents: '120000', n: '1' },
      ],
    })
    const out = await service.weekDelta(WS, {}, NOW)
    expect(out.cashIn).toEqual({
      count: 3,
      amountCents: 620000,
      lines: [
        { accountId: 'a1', accountName: 'Airbus', amountCents: 500000, count: 2 },
        { accountId: 'a2', accountName: 'Orange', amountCents: 120000, count: 1 },
      ],
    })
  })

  it('isolation : chaque requête est bornée au workspace de l’appelant', async () => {
    const { service, query } = build({})
    await service.weekDelta(WS, {}, NOW)
    expect(query).toHaveBeenCalledTimes(4)
    for (const [sql, params] of query.mock.calls) {
      expect(sql).toContain('workspace_id = $1')
      expect(params[0]).toBe(WS)
    }
  })

  it('période explicite respectée', async () => {
    const { service } = build({})
    const out = await service.weekDelta(WS, { from: '2026-09-01T00:00:00Z', to: '2026-09-08T00:00:00Z' }, NOW)
    expect(out.period).toEqual({ from: '2026-09-01T00:00:00.000Z', to: '2026-09-08T00:00:00.000Z' })
  })
})

describe('WeekDeltaService.monthObjective', () => {
  const sum = (n: number, withAmount: number, total: string | null) => () => [
    { n: String(n), n_amount: String(withAmount), total },
  ]

  it('objectif, réalisé, couverture et rythme (dates relatives à now)', async () => {
    const { service, query } = build({
      target: () => [{ declared: '2', total: '100000' }],
      realised: sum(2, 2, '40000'),
      pipe: sum(5, 4, '90000'),
    })
    const out = await service.monthObjective(WS, NOW)
    expect(out).toMatchObject({
      month: '2026-10-01',
      target: 100000,
      realised: 40000,
      openPipe: 90000,
      workingDaysLeft: 13,
      remaining: 60000,
      coverage: 1.5,
    })
    expect(out.expectedPacePerDay).toBeCloseTo(60000 / 13)
    for (const [sql, params] of query.mock.calls) {
      expect(sql).toContain('workspace_id = $1')
      expect(params[0]).toBe(WS)
    }
  })

  it('aucun objectif saisi : target null, aucun chiffre dérivé', async () => {
    const { service } = build({
      target: () => [{ declared: '0', total: null }],
      realised: sum(1, 1, '1000'),
      pipe: sum(1, 1, '2000'),
    })
    const out = await service.monthObjective(WS, NOW)
    expect(out.target).toBeNull()
    expect(out.remaining).toBeNull()
    expect(out.coverage).toBeNull()
    expect(out.expectedPacePerDay).toBeNull()
    expect(out.realised).toBe(1000)
  })

  it('rien de signé = 0 mesuré ; signé sans montant = null', async () => {
    const zero = await build({
      target: () => [{ declared: '1', total: '10' }],
      realised: sum(0, 0, null),
      pipe: sum(0, 0, null),
    }).service.monthObjective(WS, NOW)
    expect(zero.realised).toBe(0)
    expect(zero.openPipe).toBe(0)
    const unknown = await build({
      target: () => [{ declared: '1', total: '10' }],
      realised: sum(2, 0, null),
      pipe: sum(2, 0, null),
    }).service.monthObjective(WS, NOW)
    expect(unknown.realised).toBeNull()
    expect(unknown.openPipe).toBeNull()
    expect(unknown.coverage).toBeNull()
  })

  it('lecture de l’objectif en échec : target null', async () => {
    const { service } = build({
      target: () => {
        throw new Error('x')
      },
      realised: sum(0, 0, null),
      pipe: sum(0, 0, null),
    })
    expect((await service.monthObjective(WS, NOW)).target).toBeNull()
  })

  it('#4191 R22 — « créées » ne compte que des AFFAIRES créées : ni signaux, ni entonnoir (pistes de l’analyse)', async () => {
    const { service, query } = build({ created: () => [] })
    await service.weekDelta(WS, {}, NOW)
    const sql = String(query.mock.calls.map(call => call[0]).find(text => String(text).includes('first_detected_at')))
    expect(sql).toMatch(/o\.kind\s*<>\s*'signal'/)
    expect(sql).toMatch(/o\.stage NOT IN \('detected','potential'\)/)
  })
})
