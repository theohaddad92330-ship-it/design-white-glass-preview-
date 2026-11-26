import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_DOSSIERS, DEMO_PIPE_L2 } from './demo-dataset'
import { buildDemoPipeRows } from './demo-pipe-journal'
import { buildDemoCrmDeals } from './demo-crm-deals'
import {
  computePipeByOwner,
  computePipeWaterfall,
  computeRiskSignals,
  isOpenPipeStage,
  medianOf,
  type PipeOpportunity,
} from '../pilotage/pipe-calc'

/**
 * L2 Pipe en démo (craft rule 9) : le jeu de données doit RACONTER quelque
 * chose — un waterfall dont chaque barre est non nulle, un journal cohérent
 * avec l'état courant (aucun écart non expliqué), des signaux de chaque
 * famille, toutes les catégories déclarées dont « non déclarée » — et ce
 * QUEL QUE SOIT le jour du mois où l'on regarde (la salle est relative à `now`).
 */
const DAY_MS = 86_400_000
const OWNER = '33333333-3333-4333-8333-333333333333'
const NOWS = ['2026-10-03T12:00:00Z', '2026-10-14T12:00:00Z', '2026-10-28T12:00:00Z', '2026-12-31T20:00:00Z'].map(
  value => new Date(value),
)

function world(now: Date) {
  const rows = buildDemoPipeRows(now)
  const opportunities: PipeOpportunity[] = rows.map((row, index) => ({
    id: `opp-${index}`,
    accountId: row.deal.account,
    accountName: row.deal.account,
    label: row.deal.label,
    stage: row.deal.stage,
    stageEnteredAt: row.stageEnteredAt,
    amountCents: row.deal.amountCents,
    expectedCloseOn: row.expectedCloseOn,
    forecastCategory: row.deal.category,
    ownerId: OWNER,
    ownerName: 'Commercial démo',
    firstDetectedAt: row.firstDetectedAt,
    closedAt: row.closedAt,
    outcome: row.deal.stage === 'won' || row.deal.stage === 'lost' ? row.deal.stage : null,
  }))
  const transitions = rows.flatMap((row, index) =>
    row.transitions.map(step => ({
      opportunityId: `opp-${index}`,
      fromState: step.from,
      toState: step.to,
      occurredAt: step.at,
    })),
  )
  const amountChanges = rows.flatMap((row, index) =>
    row.amountChanges.map(change => ({
      opportunityId: `opp-${index}`,
      fromCents: change.fromCents,
      toCents: change.toCents,
      occurredAt: change.at,
    })),
  )
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  return { rows, opportunities, transitions, amountChanges, monthStart }
}

describe('le pipe L2 de la salle de démonstration', () => {
  it('ne parle que des comptes RÉELS des dossiers de la salle', () => {
    const real = new Set(DEMO_DOSSIERS.map(dossier => dossier.account.company_name))
    for (const deal of DEMO_PIPE_L2.deals) expect(real).toContain(deal.account)
  })

  it('les libellés sont uniques par compte (contrainte (compte, nature, libellé))', () => {
    const keys = DEMO_PIPE_L2.deals.map(deal => `${deal.account}|${deal.label}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it.each(NOWS.map(now => [now.toISOString(), now] as const))(
    'waterfall non trivial et équilibré le %s',
    (_label, now) => {
      const { opportunities, transitions, amountChanges, monthStart } = world(now)
      const w = computePipeWaterfall({ opportunities, transitions, amountChanges, from: monthStart, to: now })
      expect(w.unexplainedCents).toBe(0)
      for (const bar of [
        'createdCents',
        'raisedCents',
        'loweredCents',
        'lostCents',
        'signedCents',
        'removedCents',
      ] as const) {
        expect([bar, w[bar] > 0]).toEqual([bar, true])
      }
      expect(w.openingCents).toBeGreaterThan(0)
      expect(w.closingCents).toBeGreaterThan(0)
      expect(w.withoutAmountCount).toBe(1) // l'affaire ENGIE sans montant : nommée, jamais 0 €
      expect(
        w.openingCents + w.createdCents + w.raisedCents - w.loweredCents - w.lostCents - w.signedCents - w.removedCents,
      ).toBe(w.closingCents)
    },
  )

  it('exerce chaque catégorie déclarée ET « non déclarée » sur les ouvertes', () => {
    const { rows } = world(NOWS[1] as Date)
    const open = rows.filter(row => isOpenPipeStage(row.deal.stage))
    const seen = new Set(open.map(row => row.deal.category))
    expect([...seen].sort()).toEqual([null, 'best_case', 'commit', 'omitted', 'pipeline'].sort())
  })

  it('exerce chaque famille de signal de risque (dépassée, repoussée, baissée, étape inchangée, sans activité)', () => {
    const now = NOWS[1] as Date
    const { rows, opportunities } = world(now)
    const openIdx = rows.map((row, index) => [row, index] as const).filter(([row]) => isOpenPipeStage(row.deal.stage))
    const medians = new Map<string, number>()
    for (const stage of new Set(openIdx.map(([row]) => row.deal.stage))) {
      const days = openIdx
        .filter(([row]) => row.deal.stage === stage)
        .map(([row]) => Math.floor((now.getTime() - row.stageEnteredAt.getTime()) / DAY_MS))
      if (days.length >= 3) medians.set(stage, medianOf(days) as number)
    }
    const kinds = new Set<string>()
    for (const [row, index] of openIdx) {
      const opp = opportunities[index] as PipeOpportunity
      const lowered = row.amountChanges.find(
        change => change.fromCents !== null && change.toCents !== null && change.toCents < change.fromCents,
      )
      const signals = computeRiskSignals(opp, {
        now,
        lastActivityAt: row.lastActivityAt,
        closeDatePushes: row.closeDateChanges.filter(change => change.to > change.from).length,
        lastAmountLowering: lowered
          ? { at: lowered.at, fromCents: lowered.fromCents as number, toCents: lowered.toCents as number }
          : null,
        stageMedianDays: medians.get(row.deal.stage) ?? null,
        daysInStage: Math.floor((now.getTime() - row.stageEnteredAt.getTime()) / DAY_MS),
      })
      for (const signal of signals) kinds.add(signal.kind)
    }
    expect([...kinds].sort()).toEqual(['amount_lowered', 'close_overdue', 'close_pushed', 'no_activity', 'stage_stale'])
  })

  it('un seul commercial : taux de gain chiffré avec son dénominateur, cycle médian mesuré', () => {
    const now = NOWS[1] as Date
    const { opportunities, monthStart } = world(now)
    const { owners } = computePipeByOwner({ opportunities, from: monthStart, to: now })
    expect(owners).toHaveLength(1)
    expect(owners[0]).toMatchObject({ winRateWon: 6, winRateLost: 4 })
    expect(owners[0]?.winRate).toBeCloseTo(0.6)
    expect(owners[0]?.medianCycleDays).not.toBeNull()
    expect(owners[0]?.signedCount).toBe(1)
  })

  it('les déclarations posées sur des opportunités déjà semées visent des libellés qui existent', () => {
    const source = readFileSync(join(__dirname, 'demo-dataset.ts'), 'utf8')
    for (const declaration of DEMO_PIPE_L2.existingDeclarations) {
      expect(source).toContain(`label: '${declaration.label}'`)
    }
  })
})

// V4-CORRECTIFS-B (b) — une affaire gagnée ou perdue n'est jamais datée après aujourd'hui, quelle que soit la visite.
describe('V4-CORRECTIFS-B (b) — aucune issue datée dans le futur', () => {
  it.each(['2026-10-01T00:30:00Z', '2026-10-20T10:00:00Z', '2026-10-31T23:00:00Z', '2027-02-14T12:00:00Z'])(
    'visite du %s',
    visit => {
      const now = new Date(visit)
      for (const row of buildDemoPipeRows(now)) {
        if (row.deal.stage === 'won' || row.deal.stage === 'lost') {
          expect(row.closedAt?.getTime() ?? 0).toBeLessThanOrEqual(now.getTime())
        }
      }
      for (const fact of buildDemoCrmDeals(now).facts) {
        if (fact.is_won !== null) expect(fact.closed_at?.getTime() ?? 0).toBeLessThanOrEqual(now.getTime())
      }
    },
  )
})
