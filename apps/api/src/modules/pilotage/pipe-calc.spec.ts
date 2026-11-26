import { PIPE_OWNER_WINDOWS } from '@bellum/contracts'
import {
  computePipeByOwner,
  computePipeWaterfall,
  computeRiskSignals,
  medianOf,
  type PipeAmountChange,
  type PipeOpportunity,
  type PipeStageTransition,
} from './pipe-calc'

const D = (iso: string): Date => new Date(`${iso}T12:00:00.000Z`)

function opp(over: Partial<PipeOpportunity> & { id: string }): PipeOpportunity {
  return {
    accountId: 'acc',
    accountName: 'Société Générale',
    label: 'TMA',
    stage: 'qualified',
    stageEnteredAt: D('2026-01-01'),
    amountCents: 100_000,
    expectedCloseOn: null,
    forecastCategory: null,
    ownerId: 'u1',
    ownerName: 'Camille',
    firstDetectedAt: D('2026-01-01'),
    closedAt: null,
    outcome: null,
    ...over,
  }
}
const tr = (opportunityId: string, at: string, from: string | null, to: string): PipeStageTransition => ({
  opportunityId,
  occurredAt: D(at),
  fromState: from,
  toState: to,
})
const ch = (opportunityId: string, at: string, from: number | null, to: number | null): PipeAmountChange => ({
  opportunityId,
  occurredAt: D(at),
  fromCents: from,
  toCents: to,
})

function balance(w: ReturnType<typeof computePipeWaterfall>): number {
  return w.openingCents + w.createdCents + w.raisedCents - w.loweredCents - w.lostCents - w.signedCents - w.removedCents
}

describe('computePipeWaterfall', () => {
  const from = D('2026-10-01')
  const to = D('2026-10-14')

  it("l'équation d'équilibre tient sur un mois chargé (historique complet)", () => {
    const opps = [
      // ouverte au début, montée puis rien : 100k -> 150k
      opp({ id: 'a', amountCents: 150_000 }),
      // ouverte au début, perdue le 5 : 200k
      opp({ id: 'b', stage: 'lost', amountCents: 200_000, closedAt: D('2026-10-05'), outcome: 'lost' }),
      // ouverte au début, signée le 8 après avoir baissé 300k -> 250k
      opp({ id: 'c', stage: 'won', amountCents: 250_000, closedAt: D('2026-10-08'), outcome: 'won' }),
      // créée le 3 directement en pipe 80k, montée à 120k
      opp({ id: 'd', firstDetectedAt: D('2026-10-03'), stage: 'qualified', amountCents: 120_000 }),
      // entrée dans le pipe le 6 depuis detected, 50k ; mise en dormance le 12
      opp({ id: 'e', stage: 'dormant', amountCents: 50_000 }),
      // jamais dans le pipe (detected)
      opp({ id: 'f', stage: 'detected', amountCents: 999_999, firstDetectedAt: D('2026-09-01') }),
    ]
    const transitions = [
      tr('b', '2026-10-05', 'negotiation', 'lost'),
      tr('c', '2026-10-08', 'negotiation', 'won'),
      tr('d', '2026-10-03', null, 'qualified'),
      tr('e', '2026-10-06', 'detected', 'qualified'),
      tr('e', '2026-10-12', 'qualified', 'dormant'),
    ]
    const changes = [
      ch('a', '2026-10-04', 100_000, 150_000),
      ch('c', '2026-10-07', 300_000, 250_000),
      ch('d', '2026-10-04', 80_000, 120_000),
    ]
    // `e` est née avant le mois, `d` pendant — d'où les montants à l'ouverture.
    opps[3] = opp({ id: 'd', firstDetectedAt: D('2026-10-03'), stage: 'qualified', amountCents: 120_000 })
    opps[4] = opp({ id: 'e', stage: 'dormant', amountCents: 50_000, firstDetectedAt: D('2026-09-20') })
    const w = computePipeWaterfall({ opportunities: opps, transitions, amountChanges: changes, from, to })

    expect(w.openingCents).toBe(100_000 + 200_000 + 300_000) // a, b, c
    expect(w.createdCents).toBe(80_000 + 50_000) // d à sa naissance, e à son entrée
    expect(w.raisedCents).toBe(50_000 + 40_000) // a, d
    expect(w.loweredCents).toBe(50_000) // c
    expect(w.lostCents).toBe(200_000)
    expect(w.signedCents).toBe(250_000)
    expect(w.removedCents).toBe(50_000)
    expect(w.closingCents).toBe(150_000 + 120_000)
    expect(w.unexplainedCents).toBe(0)
    expect(balance(w)).toBe(w.closingCents)
    expect(w.openingCount).toBe(3)
    expect(w.closingCount).toBe(2)
  })

  it("un historique incomplet se NOMME : l'écart n'est pas absorbé", () => {
    // Née dans le pipe sans aucune ligne de journal : sa naissance est inconnue.
    const opps = [opp({ id: 'x', firstDetectedAt: D('2026-10-02'), stage: 'qualified', amountCents: 70_000 })]
    const w = computePipeWaterfall({ opportunities: opps, transitions: [], amountChanges: [], from, to })
    // Née pendant la période, étape courante ouverte → créée (naissance reconstruite).
    expect(w.createdCents).toBe(70_000)
    expect(w.unexplainedCents).toBe(0)
    // Mais une opportunité d'avant la période devenue ouverte SANS transition : écart.
    const gap = computePipeWaterfall({
      opportunities: [opp({ id: 'y', stage: 'qualified', firstDetectedAt: D('2026-09-01'), amountCents: 10_000 })],
      // Le journal dit « dormant », la ligne dit « qualified » : l'écart se nomme.
      transitions: [tr('y', '2026-10-05', 'qualified', 'dormant')],
      amountChanges: [],
      from,
      to,
    })
    expect(balance(gap) + gap.unexplainedCents).toBe(gap.closingCents)
    expect(gap.unexplainedCents).not.toBe(0)
  })

  it("une opportunité sans montant n'est pas un 0 : elle est comptée à part", () => {
    const w = computePipeWaterfall({
      opportunities: [opp({ id: 'n', amountCents: null }), opp({ id: 'm', amountCents: 5_000 })],
      transitions: [],
      amountChanges: [],
      from,
      to,
    })
    expect(w.openingCents).toBe(5_000)
    expect(w.closingCents).toBe(5_000)
    expect(w.withoutAmountCount).toBe(1)
    expect(w.openingCount).toBe(2)
  })

  it('les opportunités nées après la fin ne comptent pas', () => {
    const w = computePipeWaterfall({
      opportunities: [opp({ id: 'late', firstDetectedAt: D('2026-10-20') })],
      transitions: [],
      amountChanges: [],
      from,
      to,
    })
    expect(w.openingCents + w.closingCents + w.createdCents).toBe(0)
  })
})

describe('computeRiskSignals', () => {
  const now = D('2026-10-14')
  const base = {
    now,
    lastActivityAt: null as Date | null,
    closeDatePushes: 0,
    lastAmountLowering: null as { at: Date; fromCents: number; toCents: number } | null,
    stageMedianDays: null as number | null,
    daysInStage: 3,
  }

  it('aucun fait → aucun signal (une absence ne fait aucune ligne)', () => {
    expect(computeRiskSignals(opp({ id: 'a' }), base)).toEqual([])
  })

  it('date prévue dépassée de 12 j', () => {
    const s = computeRiskSignals(opp({ id: 'a', expectedCloseOn: '2026-10-02' }), base)
    expect(s).toEqual([expect.objectContaining({ kind: 'close_overdue', days: 12 })])
  })

  it("la date du jour n'est pas dépassée", () => {
    expect(computeRiskSignals(opp({ id: 'a', expectedCloseOn: '2026-10-14' }), base)).toEqual([])
  })

  it('aucune activité depuis 30 j ; inconnue → pas de signal ; récente → pas de signal', () => {
    expect(computeRiskSignals(opp({ id: 'a' }), { ...base, lastActivityAt: D('2026-09-14') })).toEqual([
      expect.objectContaining({ kind: 'no_activity', days: 30 }),
    ])
    expect(computeRiskSignals(opp({ id: 'a' }), { ...base, lastActivityAt: D('2026-10-10') })).toEqual([])
  })

  it('date repoussée ≥ 2 fois', () => {
    expect(computeRiskSignals(opp({ id: 'a' }), { ...base, closeDatePushes: 1 })).toEqual([])
    expect(computeRiskSignals(opp({ id: 'a' }), { ...base, closeDatePushes: 3 })).toEqual([
      expect.objectContaining({ kind: 'close_pushed', count: 3 }),
    ])
  })

  it('montant baissé, dans la fenêtre seulement', () => {
    const recent = { at: D('2026-10-01'), fromCents: 200_000, toCents: 150_000 }
    expect(computeRiskSignals(opp({ id: 'a' }), { ...base, lastAmountLowering: recent })).toEqual([
      expect.objectContaining({ kind: 'amount_lowered', fromCents: 200_000, toCents: 150_000 }),
    ])
    const old = { ...recent, at: D('2026-05-01') }
    expect(computeRiskSignals(opp({ id: 'a' }), { ...base, lastAmountLowering: old })).toEqual([])
  })

  it('étape inchangée au-delà de la médiane du stade', () => {
    expect(computeRiskSignals(opp({ id: 'a' }), { ...base, daysInStage: 20, stageMedianDays: 10 })).toEqual([
      expect.objectContaining({ kind: 'stage_stale', days: 20 }),
    ])
    expect(computeRiskSignals(opp({ id: 'a' }), { ...base, daysInStage: 10, stageMedianDays: 10 })).toEqual([])
    expect(computeRiskSignals(opp({ id: 'a' }), { ...base, daysInStage: 99, stageMedianDays: null })).toEqual([])
  })
})

describe('computePipeByOwner', () => {
  const from = D('2026-10-01')
  const to = D('2026-10-14')

  it('taux de gain = signées ÷ (signées + perdues) sur 90 j, avec son dénominateur', () => {
    const closed = (i: number, outcome: 'won' | 'lost', at: string) =>
      opp({
        id: `o${i}`,
        stage: outcome,
        outcome,
        closedAt: D(at),
        amountCents: 1_000,
        firstDetectedAt: D('2026-06-01'),
      })
    const opps = [
      ...Array.from({ length: 6 }, (_, i) => closed(i, 'won', '2026-10-05')),
      ...Array.from({ length: 4 }, (_, i) => closed(10 + i, 'lost', '2026-09-01')),
      // hors fenêtre de 90 j : ne compte pas
      closed(99, 'lost', '2026-05-01'),
    ]
    const [row] = computePipeByOwner({ opportunities: opps, from, to }).owners
    expect(row?.winRateWon).toBe(6)
    expect(row?.winRateLost).toBe(4)
    expect(row?.winRate).toBeCloseTo(0.6)
    expect(row?.signedCount).toBe(6)
    expect(row?.signedCents).toBe(6_000)
  })

  it(`sous ${PIPE_OWNER_WINDOWS.winRateMinBase} clôturées : pas de %, mais les comptes`, () => {
    const opps = [
      opp({ id: 'w', stage: 'won', outcome: 'won', closedAt: D('2026-10-05') }),
      opp({ id: 'l', stage: 'lost', outcome: 'lost', closedAt: D('2026-10-06') }),
    ]
    const [row] = computePipeByOwner({ opportunities: opps, from, to }).owners
    expect(row?.winRate).toBeNull()
    expect([row?.winRateWon, row?.winRateLost]).toEqual([1, 1])
  })

  it('cycle de vente médian création → signature des signées de 180 j ; aucune signée → null', () => {
    const won = (id: string, created: string, closed: string) =>
      opp({ id, stage: 'won', outcome: 'won', firstDetectedAt: D(created), closedAt: D(closed) })
    const opps = [
      won('a', '2026-09-01', '2026-10-01'), // 30
      won('b', '2026-08-01', '2026-10-01'), // 61
      won('c', '2026-09-21', '2026-10-01'), // 10
      won('old', '2025-01-01', '2025-02-01'), // hors 180 j
    ]
    const [row] = computePipeByOwner({ opportunities: opps, from, to }).owners
    expect(row?.medianCycleDays).toBe(30)
    expect(row?.cycleSample).toBe(3)
    const [empty] = computePipeByOwner({ opportunities: [opp({ id: 'z' })], from, to }).owners
    expect(empty?.medianCycleDays).toBeNull()
    expect(empty?.winRate).toBeNull()
  })

  it('pipe ouvert par commercial ; sans porteur = ligne « non attribué »', () => {
    const opps = [
      opp({ id: 'a', ownerId: 'u1', amountCents: 10_000 }),
      opp({ id: 'b', ownerId: null, ownerName: null, amountCents: 5_000 }),
      opp({ id: 'c', ownerId: 'u1', amountCents: null }),
    ]
    const { owners } = computePipeByOwner({ opportunities: opps, from, to })
    expect(owners.find(o => o.ownerId === 'u1')).toMatchObject({ openCount: 2, openCents: 10_000 })
    expect(owners.find(o => o.ownerId === null)).toMatchObject({ openCount: 1, openCents: 5_000 })
  })
})

describe('medianOf', () => {
  it('médiane paire et impaire, vide → null', () => {
    expect(medianOf([])).toBeNull()
    expect(medianOf([3, 1, 2])).toBe(2)
    expect(medianOf([1, 2, 3, 4])).toBe(2.5)
  })
})
