import { receivableAlertsByMission } from './mission-billing-alerts'

// #2408 — les factures émises en retard, par mission : une lecture groupée, jamais une par ligne.
const NOW = new Date('2026-10-15T12:00:00Z')
const row = (over: Record<string, unknown> = {}) => ({
  mission_id: 'm1',
  invoiced_amount_cents: '1000000',
  paid_at: null,
  paid_amount_cents: null,
  due_on: '2026-09-30',
  disputed_at: null,
  dispute_resolved_at: null,
  ...over,
})
const manager = (rows: unknown[]) => ({ query: jest.fn().mockResolvedValue(rows) })

describe('receivableAlertsByMission (#2408)', () => {
  it('regroupe par mission en gardant l’alerte la plus grave', async () => {
    const m = manager([
      row({ mission_id: 'm1', paid_at: new Date('2026-10-02'), paid_amount_cents: '400000' }),
      row({ mission_id: 'm1' }),
      row({ mission_id: 'm2', paid_at: new Date('2026-10-02'), paid_amount_cents: '400000' }),
    ])
    const out = await receivableAlertsByMission(m, 'ws-1', NOW)
    expect(out.get('m1')).toEqual(['payment_late', 'invoice_overdue'])
    expect(out.get('m2')).toEqual(['payment_late'])
  })

  it('SAIT DIRE NON — soldée, litige, non échue : aucune entrée', async () => {
    const m = manager([
      row({ paid_at: new Date('2026-10-02'), paid_amount_cents: '1000000' }),
      row({ mission_id: 'm3', disputed_at: new Date('2026-10-01') }),
      row({ mission_id: 'm4', due_on: '2026-11-30' }),
    ])
    expect((await receivableAlertsByMission(m, 'ws-1', NOW)).size).toBe(0)
  })

  it('borne l’ESPACE et ne lit que les factures émises non annulées', async () => {
    const m = manager([])
    await receivableAlertsByMission(m, 'ws-1', NOW)
    const [sql, params] = m.query.mock.calls[0]!
    expect(sql).toContain('workspace_id = $1')
    expect(sql).toContain('invoice_cancelled_at IS NULL')
    expect(sql).toContain("state IN ('invoiced', 'invoiced_declared')")
    expect(params).toEqual(['ws-1'])
  })
})
