import { NotFoundException } from '@nestjs/common'
import { MissionBillingService } from './mission-billing.service'

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'
const USER = 'u0000000-0000-4000-8000-000000000001'
const MISSION = 'm0000000-0000-4000-8000-000000000001'

function makeService(routes: Record<string, unknown[]> = {}) {
  const queries: { sql: string; params: unknown[] }[] = []
  const manager = {
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params })
      for (const [needle, rows] of Object.entries(routes)) if (sql.includes(needle)) return rows
      return []
    }),
  }
  return { service: new MissionBillingService({ manager } as never), queries }
}

const MISSION_ROW = { 'FROM missions WHERE id': [{ id: MISSION, started_on: '2026-08-17', ends_on: null }] }

// Tranché par Louis 22/09 soir (decisions §8) : DÉCLARATIFS minimaux.
describe('MissionBillingService — #2417.3 les jalons déclarés', () => {
  it('ajoute un jalon (libellé, date, montant) sur une mission DE L’ESPACE, source `manual`', async () => {
    const { service, queries } = makeService(MISSION_ROW)
    await service.addMilestone(WORKSPACE, USER, MISSION, {
      label: 'Recette lot 1',
      dueOn: '2026-08-31',
      amountCents: 500_000,
    })
    const insert = queries.find(q => q.sql.includes('INSERT INTO mission_milestones'))
    expect(insert?.params).toEqual([MISSION, WORKSPACE, 'Recette lot 1', '2026-08-31', 500_000, USER])
    expect(insert?.sql).toContain("'manual'")
  })

  it('refuse une mission d’un autre espace', async () => {
    const { service } = makeService()
    await expect(
      service.addMilestone(WORKSPACE, USER, MISSION, { label: 'x', dueOn: '2026-08-31', amountCents: 1 }),
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it('un jalon s’ARCHIVE, il ne se supprime pas', async () => {
    const { service, queries } = makeService({ ...MISSION_ROW, 'SET archived_at': [{ id: 'j1' }] })
    await service.archiveMilestone(WORKSPACE, MISSION, 'j1')
    expect(queries.some(q => /DELETE/i.test(q.sql))).toBe(false)
    expect(queries.find(q => q.sql.includes('SET archived_at'))?.params).toEqual(['j1', MISSION, WORKSPACE])
  })
})

describe('MissionBillingService — #2417.4/.5 retainer et placement déclarés', () => {
  it('lit le retainer PRORATISÉ du mois et la garantie de placement, rien de deviné', async () => {
    const { service } = makeService({
      ...MISSION_ROW,
      'FROM mission_billing_declarations': [
        { retainer_monthly_cents: '2100000', placement_fee_cents: '1500000', placement_guarantee_days: 90 },
      ],
      'FROM mission_milestones': [],
    })
    const read = await service.read(WORKSPACE, MISSION, '2026-08-20')
    // Du lundi 17 au lundi 31 août : 11 jours ouvrés sur 21.
    expect(read.retainerThisMonthCents).toBe(1_100_000)
    expect(read.placementFeeCents).toBe(1_500_000)
    expect(read.placementGuarantee).toEqual({ endsOn: '2026-11-15', secured: false })
    expect(read.source).toBe('manual')
  })

  it('sans déclaration, tout est `null` — jamais 0', async () => {
    const { service } = makeService(MISSION_ROW)
    const read = await service.read(WORKSPACE, MISSION, '2026-08-20')
    expect(read.retainerMonthlyCents).toBeNull()
    expect(read.retainerThisMonthCents).toBeNull()
    expect(read.placementGuarantee).toBeNull()
  })

  it('écrit en FUSION : un champ absent de la charge utile n’est pas effacé', async () => {
    const { service, queries } = makeService(MISSION_ROW)
    await service.writeDeclarations(WORKSPACE, USER, MISSION, { placementGuaranteeDays: 90 })
    const upsert = queries.find(q => q.sql.includes('INSERT INTO mission_billing_declarations'))
    expect(upsert?.sql).toContain('CASE WHEN $6::boolean')
    // retainer non fourni → drapeau « écrit » à false.
    expect(upsert?.params.slice(5, 8)).toEqual([false, false, true])
  })
})
