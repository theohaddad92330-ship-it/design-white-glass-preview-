import { BusinessMetricSnapshotEntity } from '../../database/entities/business-metric-snapshot.entity'
import { BusinessMetricSnapshotLineEntity } from '../../database/entities/business-metric-snapshot-line.entity'
import { BusinessMetricsService } from './business-metrics.service'
import { BusinessMetricsSnapshotService } from './business-metrics-snapshot.service'
import type { PlanGridsReader } from './module-tokens'

/**
 * Un dépôt en mémoire, à clé composée. Assez pour ce que ce service demande :
 * `find`, `findOne`, `create`, `save`, `insert` — et rien de plus, pour que le
 * test échoue si le service se met à faire autre chose.
 */
function repo<T extends Record<string, unknown>>(keys: (keyof T)[], seed: T[] = []) {
  // ⚠️ Le tableau SOURCE, pas une copie : un test qui fait partir un client le
  // fait en mutant `subs`, et une copie rendrait ce geste invisible du service.
  const rows = seed
  const keyOf = (row: Partial<T>) => keys.map(k => String(row[k])).join('|')
  const matches = (row: T, where: Partial<T> | undefined) =>
    where === undefined || Object.entries(where).every(([k, v]) => row[k as keyof T] === v)

  return {
    rows: () => rows,
    find: jest.fn(async (options?: { where?: Partial<T>; order?: Record<string, 'ASC' | 'DESC'>; take?: number }) => {
      let out = rows.filter(row => matches(row, options?.where))
      const [field, direction] = Object.entries(options?.order ?? {})[0] ?? []
      if (field) {
        out = [...out].sort((a, b) => {
          const av = String(a[field as keyof T])
          const bv = String(b[field as keyof T])
          return direction === 'DESC' ? (av < bv ? 1 : -1) : av < bv ? -1 : 1
        })
      }
      return options?.take ? out.slice(0, options.take) : out
    }),
    findOne: jest.fn(async (options: { where: Partial<T> }) => rows.find(row => matches(row, options.where)) ?? null),
    create: jest.fn((row: T) => ({ ...row })),
    save: jest.fn(async (row: T) => {
      const next = {
        computed_at: new Date('2026-09-07T00:00:00Z'),
        updated_at: new Date('2026-09-07T00:00:00Z'),
        ...row,
      }
      const at = rows.findIndex(existing => keyOf(existing) === keyOf(next as T))
      if (at >= 0) rows.splice(at, 1)
      rows.push(next as T)
      return next as T
    }),
    insert: jest.fn(async (batch: T[]) => {
      rows.push(...batch)
    }),
  }
}

const GRIDS: PlanGridsReader = async () => ({
  priceCents: { starter: 4900, team: 14900, growth: 19900, trial: 0, beta: 0 },
  seatCents: { starter: 900, team: 2900, growth: 4900, trial: 0, beta: 0 },
})

type Sub = { user_id: string; plan: string; extra_seats: number; billing_mode: 'stripe' | 'manual' }
type Term = { workspace_id: string; amount_cents: number; period: string }
type Workspace = { id: string; name: string; owner_user_id: string }
type Profile = { user_id: string; email: string | null }

function build(subs: Sub[] = [], terms: Term[] = [], workspaceRows: Workspace[] = [], profileRows: Profile[] = []) {
  const snapshots = repo<Record<string, unknown>>(['month'])
  const lines = repo<Record<string, unknown>>(['month', 'subject_id'])
  const treasury = repo<Record<string, unknown>>(['month'])
  const subscriptions = repo<Record<string, unknown>>(['user_id'], subs as unknown as Record<string, unknown>[])
  const termsRepo = repo<Record<string, unknown>>(['workspace_id'], terms as unknown as Record<string, unknown>[])
  const workspaces = repo<Record<string, unknown>>(['id'], workspaceRows as unknown as Record<string, unknown>[])
  const profiles = repo<Record<string, unknown>>(['user_id'], profileRows as unknown as Record<string, unknown>[])

  // La transaction du service, en mémoire. Le faux gestionnaire ROUTE PAR
  // ENTITÉ plutôt que par position : écrire les lignes dans la table des
  // instantanés passerait sans bruit avec un faux qui ignore son premier
  // argument, et c'est exactement ce que la transaction protège.
  const manager = {
    save: async (entity: unknown, row: Record<string, unknown>) => {
      if (entity !== BusinessMetricSnapshotEntity) throw new Error('entité inattendue dans save()')
      return snapshots.save(row)
    },
    insert: async (entity: unknown, batch: Record<string, unknown>[]) => {
      if (entity !== BusinessMetricSnapshotLineEntity) throw new Error('entité inattendue dans insert()')
      return lines.insert(batch)
    },
  }
  const snapshotsWithManager = {
    ...snapshots,
    manager: { transaction: async (run: (m: typeof manager) => Promise<unknown>) => run(manager) },
  }

  const service = new BusinessMetricsService(
    snapshotsWithManager as never,
    lines as never,
    treasury as never,
    subscriptions as never,
    termsRepo as never,
    workspaces as never,
    profiles as never,
    GRIDS,
  )
  return { service, snapshots, lines, treasury, workspaces, profiles }
}

describe('BusinessMetricsService — l’instantané (#1645)', () => {
  it('T1 — un mois figé ne se recalcule JAMAIS, même après un changement d’offre', async () => {
    const subs: Sub[] = [{ user_id: 'u1', plan: 'team', extra_seats: 0, billing_mode: 'stripe' }]
    const { service, snapshots } = build(subs)

    const first = await service.takeSnapshot('2026-08')
    expect(first.frozen).toBe(true)
    expect(first.snapshot.mrrEndCents).toBe(14900)

    // Le client passe à growth APRÈS la photo.
    subs[0]!.plan = 'growth'

    const again = await service.takeSnapshot('2026-08')
    expect(again.frozen).toBe(false)
    expect(again.snapshot.mrrEndCents).toBe(14900)
    expect(snapshots.rows()).toHaveLength(1)
  })

  it('le PREMIER mois n’invente pas de mrrStart', async () => {
    const { service } = build([{ user_id: 'u1', plan: 'growth', extra_seats: 0, billing_mode: 'stripe' }])

    const { snapshot } = await service.takeSnapshot('2026-08')

    expect(snapshot.mrrStartCents).toBeNull()
    expect(snapshot.mrrNewCents).toBeNull()
    expect(snapshot.customersStart).toBeNull()
    expect(snapshot.mrrEndCents).toBe(19900)
    expect(snapshot.customersEnd).toBe(1)
  })

  it('décompose le mois suivant à partir des LIGNES du précédent', async () => {
    const subs: Sub[] = [
      { user_id: 'reste', plan: 'team', extra_seats: 0, billing_mode: 'stripe' },
      { user_id: 'part', plan: 'starter', extra_seats: 0, billing_mode: 'stripe' },
    ]
    const { service } = build(subs)

    await service.takeSnapshot('2026-08')

    // « part » s'en va, « reste » monte, « arrive » entre.
    subs.splice(1, 1)
    subs[0]!.plan = 'growth'
    subs.push({ user_id: 'arrive', plan: 'starter', extra_seats: 0, billing_mode: 'stripe' })

    const { snapshot } = await service.takeSnapshot('2026-09')

    expect(snapshot.mrrStartCents).toBe(19800)
    expect(snapshot.mrrExpansionCents).toBe(5000)
    expect(snapshot.mrrChurnedCents).toBe(4900)
    expect(snapshot.mrrNewCents).toBe(4900)
    expect(snapshot.mrrEndCents).toBe(24800)
    expect(snapshot.customersChurned).toBe(1)
    expect(snapshot.customersNew).toBe(1)
  })

  it('T3 — un client sur facture n’entre pas dans le MRR, il a sa PROPRE ligne', async () => {
    const { service } = build(
      [
        { user_id: 'stripe', plan: 'growth', extra_seats: 0, billing_mode: 'stripe' },
        { user_id: 'facture', plan: 'growth', extra_seats: 0, billing_mode: 'manual' },
      ],
      [{ workspace_id: 'ws', amount_cents: 240000, period: 'yearly' }],
    )

    const { snapshot } = await service.takeSnapshot('2026-08')

    expect(snapshot.mrrEndCents).toBe(19900)
    expect(snapshot.customersEnd).toBe(1)
    expect(snapshot.contractedRevenueCents).toBe(20000)
    expect(snapshot.contractedCustomers).toBe(1)
  })

  it('la série sort du plus ancien au plus récent — l’ordre d’un graphique', async () => {
    const { service } = build([{ user_id: 'u1', plan: 'team', extra_seats: 0, billing_mode: 'stripe' }])

    await service.takeSnapshot('2026-07')
    await service.takeSnapshot('2026-08')
    await service.takeSnapshot('2026-09')

    expect((await service.series()).map(m => m.month)).toEqual(['2026-07', '2026-08', '2026-09'])
  })

  it('monthToFreeze vise le mois qui vient de FINIR', () => {
    const { service } = build()

    expect(service.monthToFreeze(new Date('2026-09-01T03:20:00Z'))).toBe('2026-08')
    expect(service.monthToFreeze(new Date('2026-01-01T03:20:00Z'))).toBe('2025-12')
  })
})

describe('BusinessMetricsService — les mouvements PAR CLIENT du mois (#1646.6)', () => {
  it('joint le nom de l’espace ou, à défaut, l’e-mail du profil — ou `null` si ni l’un ni l’autre', async () => {
    const mutableSubs: Sub[] = [
      { user_id: 'reste', plan: 'team', extra_seats: 0, billing_mode: 'stripe' },
      { user_id: 'part', plan: 'starter', extra_seats: 0, billing_mode: 'stripe' },
    ]
    const { service } = build(
      mutableSubs,
      [],
      [{ id: 'w1', name: 'Acme ESN', owner_user_id: 'reste' }],
      [{ user_id: 'part', email: 'part@example.com' }],
    )
    await service.takeSnapshot('2026-08')

    // « part » s'en va, « reste » monte (espace connu), « arrive » entre sans
    // fiche du tout (ni espace ni profil connu pour lui).
    mutableSubs.splice(1, 1)
    mutableSubs[0]!.plan = 'growth'
    mutableSubs.push({ user_id: 'arrive', plan: 'starter', extra_seats: 0, billing_mode: 'stripe' })
    await service.takeSnapshot('2026-09')

    const rows = await service.monthlyClientMovements('2026-09')

    expect(rows).toEqual(
      expect.arrayContaining([
        { client: null, nature: 'nouveau', montantCents: 4900, month: '2026-09' },
        { client: 'Acme ESN', nature: 'expansion', montantCents: 5000, month: '2026-09' },
        { client: 'part@example.com', nature: 'attrition', montantCents: 4900, month: '2026-09' },
      ]),
    )
    expect(rows).toHaveLength(3)
  })

  it('un mois sans aucun mouvement rend un tableau vide, pas des lignes à 0', async () => {
    const { service } = build(
      [{ user_id: 'u1', plan: 'starter', extra_seats: 0, billing_mode: 'stripe' }],
      [],
      [{ id: 'w1', name: 'Bellum ESN', owner_user_id: 'u1' }],
    )
    await service.takeSnapshot('2026-08')
    await service.takeSnapshot('2026-09')

    expect(await service.monthlyClientMovements('2026-09')).toEqual([])
  })

  it('aucun mois précédent figé → tableau vide, jamais une erreur', async () => {
    const { service } = build([{ user_id: 'u1', plan: 'growth', extra_seats: 0, billing_mode: 'stripe' }])
    await service.takeSnapshot('2026-08')

    expect(await service.monthlyClientMovements('2026-08')).toEqual([])
  })
})

describe('BusinessMetricsService — la trésorerie (#1649)', () => {
  it('saisit un mois, puis en CORRIGE une seule case sans toucher aux autres', async () => {
    const { service } = build()

    await service.saveTreasuryMonth(
      '2026-09',
      { bankBalanceCents: 10_000_00, fixedExpensesCents: 3_000_00, variableExpensesCents: 1_200_00, collectedCents: 0 },
      'louis@bellum-it.com',
    )
    const corrected = await service.saveTreasuryMonth('2026-09', { variableExpensesCents: 1_500_00 }, null)

    expect(corrected.bankBalanceCents).toBe(10_000_00)
    expect(corrected.fixedExpensesCents).toBe(3_000_00)
    expect(corrected.variableExpensesCents).toBe(1_500_00)
    expect(corrected.burnCents).toBe(4_500_00)
  })

  it('remet un champ à « non mesuré » — ce qu’un 0 ne dirait pas', async () => {
    const { service } = build()

    await service.saveTreasuryMonth('2026-09', { collectedCents: 500 }, null)
    const cleared = await service.saveTreasuryMonth('2026-09', { collectedCents: null }, null)

    expect(cleared.collectedCents).toBeNull()
    expect(cleared.burnCents).toBeNull()
  })

  it('aucun mois saisi → rien de dérivé, et surtout aucun zéro', async () => {
    const { service } = build()

    const view = await service.treasuryView()

    expect(view.months).toEqual([])
    expect(view.latestMonth).toBeNull()
    expect(view.averageBurn).toBeNull()
    expect(view.runway).toBeNull()
  })

  it('TEST DE L’ISSUE — un seul mois saisi → runway « il faut 2 mois »', async () => {
    const { service } = build()

    await service.saveTreasuryMonth(
      '2026-09',
      { bankBalanceCents: 50_000_00, fixedExpensesCents: 3_000_00, variableExpensesCents: 1_200_00, collectedCents: 0 },
      null,
    )
    const view = await service.treasuryView()

    expect(view.runway).toEqual({ measured: false, reason: 'not_enough_months' })
  })

  it('deux mois saisis → le runway se mesure sur le DERNIER mois saisi', async () => {
    const { service } = build()
    const mois = { fixedExpensesCents: 3_000_00, variableExpensesCents: 1_200_00, collectedCents: 0 }

    await service.saveTreasuryMonth('2026-08', { ...mois, bankBalanceCents: 54_200_00 }, null)
    await service.saveTreasuryMonth('2026-09', { ...mois, bankBalanceCents: 50_000_00 }, null)
    const view = await service.treasuryView()

    expect(view.latestMonth).toBe('2026-09')
    expect(view.runway).toEqual({ measured: true, months: 11.9, averageBurnCents: 4_200_00 })
  })
})

describe('BusinessMetricsSnapshotService — le passage du 1er (#1645)', () => {
  const ENV = process.env

  afterEach(() => {
    process.env = { ...ENV }
  })

  it('fige le mois écoulé, et le rejouer ne réécrit rien', async () => {
    const { service } = build([{ user_id: 'u1', plan: 'team', extra_seats: 0, billing_mode: 'stripe' }])
    const cron = new BusinessMetricsSnapshotService(service)

    const first = await cron.freezeLastMonth(new Date('2026-09-01T03:20:00Z'))
    const second = await cron.freezeLastMonth(new Date('2026-09-01T03:20:00Z'))

    expect(first).toEqual({ month: '2026-08', frozen: true })
    expect(second).toEqual({ month: '2026-08', frozen: false })
  })

  it('l’interrupteur l’arrête AVANT toute écriture', async () => {
    process.env = { ...ENV, BUSINESS_METRICS_SNAPSHOT_DISABLED: 'true' }
    const { service, snapshots } = build([{ user_id: 'u1', plan: 'team', extra_seats: 0, billing_mode: 'stripe' }])
    const cron = new BusinessMetricsSnapshotService(service)

    expect(await cron.freezeLastMonth(new Date('2026-09-01T03:20:00Z'))).toBeNull()
    expect(snapshots.rows()).toHaveLength(0)
  })
})
