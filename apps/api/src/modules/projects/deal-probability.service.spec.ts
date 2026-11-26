import { calibratedProbabilitySchema, probableQuarterSchema } from '@bellum/contracts'
import type { Repository } from 'typeorm'
import type { ProjectEntity } from '../../database/entities/project.entity'
import { DealProbabilityService } from './deal-probability.service'

/**
 * #4016 L1 — le CA probable du trimestre, calibré sur les issues RÉELLES de
 * l'espace et sur la base anonyme commune.
 */
describe('DealProbabilityService (#4016 L1)', () => {
  const NOW = new Date('2026-10-11T10:00:00Z')
  let query: jest.Mock
  let caseOutcomesElsewhere: jest.Mock
  let service: DealProbabilityService
  const shared = (accountId: string) => caseOutcomesElsewhere('ws-1', accountId)

  beforeEach(() => {
    query = jest.fn()
    caseOutcomesElsewhere = jest.fn().mockResolvedValue({
      basis: 'shared_anonymous_base',
      minWorkspaces: 3,
      status: 'not_enough_shared_data',
    })
    service = new DealProbabilityService({ manager: { query } } as unknown as Repository<ProjectEntity>)
  })

  const openDeal = {
    id: 'o-1',
    account_id: 'acc-1',
    label: 'Supervision 24/7',
    stage: 'negotiation',
    amount_cents: 100_000_00,
    currency: 'EUR',
    expected_close_on: '2026-11-15',
  }
  const decided = (stage: 'won' | 'lost', states: string[]) => ({ id: `d-${Math.random()}`, stage, states })

  it('calibre chaque affaire du trimestre sur les issues closes de l’espace', async () => {
    query
      .mockResolvedValueOnce([openDeal])
      .mockResolvedValueOnce([
        decided('won', ['qualified', 'negotiation', 'won']),
        decided('won', []),
        decided('won', []),
        decided('lost', ['negotiation', 'lost']),
        decided('lost', ['qualified', 'lost']),
      ])
    const out = await service.probableQuarter('ws-1', { kind: 'workspace' }, shared, NOW)
    expect(probableQuarterSchema.safeParse(out).success).toBe(true)
    expect(out.quarter).toEqual({ from: '2026-10-11', until: '2027-01-11' })
    const p = out.deals[0]?.closing_probability
    // Atteint la négociation : 3 gagnées + 1 perdue (la perdue au stade « qualifié » ne compte pas).
    expect(p?.axes.find(a => a.key === 'workspace_history')).toMatchObject({ won: 3, lost: 1 })
    // Sous cinq observations → non mesuré, jamais 0.
    expect(p?.value).toBeNull()
    expect(out.revenue.totals).toBeNull()
    expect(out.revenue.without_probability).toBe(1)
  })

  it('la base commune complète le calibrage et le CA probable sort avec son intervalle', async () => {
    query
      .mockResolvedValueOnce([openDeal])
      .mockResolvedValueOnce([decided('won', []), decided('won', []), decided('lost', ['negotiation', 'lost'])])
    caseOutcomesElsewhere.mockResolvedValue({
      basis: 'shared_anonymous_base',
      minWorkspaces: 3,
      status: 'shared',
      lines: [
        { dimension: 'size', value: 'ge', won: 4, lost: 3, contributingWorkspaces: 3 },
        { dimension: 'sector', value: 'naf_64', won: 5, lost: 4, contributingWorkspaces: 4 },
      ],
    })
    const out = await service.probableQuarter('ws-1', { kind: 'workspace' }, shared, NOW)
    const p = out.deals[0]?.closing_probability
    expect(calibratedProbabilitySchema.safeParse(p).success).toBe(true)
    // Le secteur passe avant la taille, même s'il vient en second.
    expect(p?.axes.find(a => a.key === 'shared_base')).toMatchObject({ evaluable: true, reason: 'sector' })
    // Beta(1 + 2 + 5, 1 + 1 + 4)
    expect(p?.value).toBeCloseTo(8 / 14, 6)
    const eur = out.revenue.totals?.[0]
    expect(eur?.currency).toBe('EUR')
    expect(eur?.expected_cents).toBe(Math.round(100_000_00 * (8 / 14)))
    expect(eur!.low_cents).toBeLessThan(eur!.expected_cents)
    expect(eur!.high_cents).toBeGreaterThan(eur!.expected_cents)
    expect(caseOutcomesElsewhere).toHaveBeenCalledWith('ws-1', 'acc-1')
  })

  it('lit le pipe OUVERT du trimestre et les issues DÉCIDÉES de l’espace — rien d’autre', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([])
    await service.probableQuarter('ws-1', { kind: 'workspace' }, shared, NOW)
    const [openSql, openParams] = query.mock.calls[0] as [string, unknown[]]
    expect(openSql).toContain("o.stage IN ('confirmed','qualified','profiles_submitted','negotiation')")
    expect(openSql).toContain('o.expected_close_on >= $2::date AND o.expected_close_on < $3::date')
    expect(openParams).toEqual(['ws-1', '2026-10-11', '2027-01-11'])
    const [historySql] = query.mock.calls[1] as [string, unknown[]]
    expect(historySql).toContain("o.stage IN ('won','lost')")
    expect(historySql).toContain("t.subject_type = 'opportunity'")
    // Aucune lecture de personne : ni contact, ni profil (c58).
    expect(`${openSql}${historySql}`).not.toMatch(/\b(contacts|profiles)\b/)
  })

  it('« mon portefeuille » restreint le pipe par la définition unique du périmètre', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([])
    await service.probableQuarter('ws-1', { kind: 'own', userId: 'u-1' }, shared, NOW)
    const [openSql, openParams] = query.mock.calls[0] as [string, unknown[]]
    expect(openParams).toContain('u-1')
    expect(openSql.length).toBeGreaterThan(0)
  })

  it('un espace sans affaire au trimestre rend un total `null`, jamais 0', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([])
    const out = await service.probableQuarter('ws-1', { kind: 'workspace' }, shared, NOW)
    expect(out.deals).toEqual([])
    expect(out.revenue.totals).toBeNull()
  })

  // #4016.1c — le calibrage mesuré a posteriori, sur les mêmes issues closes.
  it('joint le calibrage mesuré (rétro-test) calculé sur les issues closes lues', async () => {
    const closed = [
      ...Array.from({ length: 6 }, () => decided('won', ['qualified', 'negotiation', 'won'])),
      ...Array.from({ length: 4 }, () => decided('lost', ['qualified', 'negotiation', 'lost'])),
    ]
    query.mockResolvedValueOnce([openDeal]).mockResolvedValueOnce(closed)
    const out = await service.probableQuarter('ws-1', { kind: 'workspace' }, shared, NOW)
    expect(probableQuarterSchema.safeParse(out).success).toBe(true)
    expect(out.calibration.method).toBe('leave_one_out_v1')
    expect(out.calibration.evaluated).toBe(10)
    expect(out.calibration.brier).not.toBeNull()
  })

  it('trop peu d’issues closes : le calibrage est « non mesuré », jamais 0', async () => {
    query.mockResolvedValueOnce([openDeal]).mockResolvedValueOnce([decided('won', ['negotiation', 'won'])])
    const out = await service.probableQuarter('ws-1', { kind: 'workspace' }, shared, NOW)
    expect(out.calibration.brier).toBeNull()
    expect(out.calibration.not_measured_reason).toBe('insufficient_history')
  })
})
