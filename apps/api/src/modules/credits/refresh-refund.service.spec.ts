import { NotFoundException } from '@nestjs/common'
import { refreshRefundReason } from '@bellum/contracts'
import { FindOperator, type DataSource, type EntityManager } from 'typeorm'
import { CreditLedgerEntity } from '../../database/entities/credit-ledger.entity'
import { SubscriptionEntity } from '../../database/entities/subscription.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { RefreshRefundService } from './refresh-refund.service'

/**
 * #2650.2 — le remboursement des rafraîchissements déjà payés dans les 6 h.
 *
 * Doublure EN MÉMOIRE du registre et des abonnements (pas un simple
 * `jest.fn`) : l'idempotence ne se prouve qu'en REJOUANT le geste sur l'état
 * que le premier passage a laissé, et en COMPTANT les lignes écrites.
 */
const WS = '11111111-1111-4111-8111-111111111111'
const OTHER_WS = '22222222-2222-4222-8222-222222222222'
const OWNER = '33333333-3333-4333-8333-333333333333'
const H = 60 * 60 * 1000
const T0 = Date.parse('2026-08-22T08:00:00.000Z')

type Row = Record<string, unknown>

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, expected]) => {
    const actual = row[key]
    if (expected instanceof FindOperator) {
      if (expected.type === 'like') {
        const prefix = String(expected.value).replace(/%$/, '')
        return typeof actual === 'string' && actual.startsWith(prefix)
      }
      if (expected.type === 'in') return (expected.value as unknown[]).includes(actual)
      throw new Error(`opérateur non doublé : ${expected.type}`)
    }
    return actual === expected
  })
}

function makeStore() {
  let seq = 0
  const ledger: Row[] = []
  const subscriptions = new Map<string, { accounts_used: number; topup_analyses: number }>()
  const workspaces = new Set<string>([WS, OTHER_WS])
  const lockCalls: unknown[][] = []
  const updates: Array<{ set: Record<string, () => string>; params: Row }> = []

  const ledgerRepo = {
    find: jest.fn(async ({ where }: { where: Row }) => ledger.filter(row => matches(row, where)).map(r => ({ ...r }))),
    insert: jest.fn(async (row: Row) => {
      const id = `refund-${++seq}`
      ledger.push({ ...row, id, created_at: new Date() })
      return { identifiers: [{ id }] }
    }),
  }
  const subscriptionRepo = {
    createQueryBuilder: () => {
      let set: Record<string, () => string> = {}
      const chain = {
        update: () => chain,
        set: (value: Record<string, () => string>) => {
          set = value
          return chain
        },
        where: (_sql: string, params: Row) => ({
          execute: async () => {
            updates.push({ set, params })
            const sub = subscriptions.get(String(params['userId']))
            if (!sub) return { affected: 0 }
            // Même sémantique que le SQL (toutes les expressions lisent l'ANCIENNE ligne).
            const amount = Number(params['amount'])
            const used = sub.accounts_used
            sub.accounts_used = Math.max(used - amount, 0)
            sub.topup_analyses = sub.topup_analyses + Math.max(amount - used, 0)
            return { affected: 1 }
          },
        }),
      }
      return chain
    },
  }
  const workspaceRepo = {
    findOne: jest.fn(async ({ where }: { where: { id: string } }) =>
      workspaces.has(where.id) ? { id: where.id } : null,
    ),
  }

  const manager = {
    getRepository: (entity: unknown) => {
      if (entity === CreditLedgerEntity) return ledgerRepo
      if (entity === SubscriptionEntity) return subscriptionRepo
      if (entity === WorkspaceEntity) return workspaceRepo
      throw new Error('entité non doublée')
    },
    query: jest.fn(async (...args: unknown[]) => {
      lockCalls.push(args)
      return []
    }),
  } as unknown as EntityManager

  const dataSource = {
    manager,
    transaction: jest.fn(async (work: (m: EntityManager) => Promise<unknown>) => work(manager)),
  } as unknown as DataSource

  return { ledger, subscriptions, lockCalls, updates, ledgerRepo, dataSource }
}

function seedDebit(store: ReturnType<typeof makeStore>, id: string, offsetMs: number, overrides: Row = {}): void {
  store.ledger.push({
    id,
    owner_user_id: OWNER,
    workspace_id: WS,
    actor_user_id: 'member-1',
    kind: 'consume_enrichment',
    resource: 'enrichment_credit',
    delta: -1,
    reason: 'refresh:signals',
    account_id: 'acc-1',
    created_at: new Date(T0 + offsetMs),
    ...overrides,
  })
}

const refundRows = (store: ReturnType<typeof makeStore>) =>
  store.ledger.filter(row => row['kind'] === 'refund_enrichment')

describe('RefreshRefundService (#2650.2)', () => {
  let store: ReturnType<typeof makeStore>
  let service: RefreshRefundService

  beforeEach(() => {
    store = makeStore()
    store.subscriptions.set(OWNER, { accounts_used: 10, topup_analyses: 0 })
    service = new RefreshRefundService(store.dataSource)
    // Le 22/08 : un débit légitime, puis deux indus (30 min et 2 h après).
    seedDebit(store, 'a1', 0)
    seedDebit(store, 'a2', 30 * 60_000)
    seedDebit(store, 'a3', 2 * H)
    // Un autre axe, une heure après : légitime (chaque axe a sa fenêtre).
    seedDebit(store, 'c1', H, { reason: 'refresh:contacts' })
    // Un AUTRE espace, même motif, même compte : hors périmètre.
    seedDebit(store, 'o1', 0, { workspace_id: OTHER_WS })
    seedDebit(store, 'o2', 60_000, { workspace_id: OTHER_WS })
  })

  it('dryRun rend ce qui SERAIT remboursé et n’écrit RIEN — ni registre, ni solde, ni transaction', async () => {
    const before = store.ledger.length
    const outcome = await service.run(WS, { dryRun: true, actor: 'louis' })

    expect(outcome.dryRun).toBe(true)
    expect(outcome.refunds.map(r => r.debitId)).toEqual(['a2', 'a3'])
    expect(outcome.refunds[0]).toMatchObject({
      accountId: 'acc-1',
      dimension: 'signals',
      credits: 1,
      windowOpenedBy: 'a1',
      refundLedgerId: null,
    })
    expect(outcome.totalCredits).toBe(2)
    expect(store.ledger.length).toBe(before)
    expect(store.updates).toEqual([])
    expect(store.dataSource.transaction).not.toHaveBeenCalled()
  })

  it('le mode réel écrit UNE ligne de crédit positive tracée par débit indu, et rend le solde', async () => {
    const outcome = await service.run(WS, { dryRun: false, actor: 'louis' })

    const refunds = refundRows(store)
    expect(refunds).toHaveLength(2)
    expect(refunds[0]).toMatchObject({
      owner_user_id: OWNER,
      workspace_id: WS,
      resource: 'enrichment_credit',
      delta: 1,
      account_id: 'acc-1',
      reason: refreshRefundReason('signals', 'a2'),
    })
    expect(refunds[1]?.['reason']).toBe(refreshRefundReason('signals', 'a3'))
    expect(outcome.refunds.map(r => r.refundLedgerId)).toEqual(refunds.map(r => r['id']))
    expect(outcome.totalCredits).toBe(2)
    // Le solde bouge d'EXACTEMENT ce que le registre annonce.
    expect(store.subscriptions.get(OWNER)).toEqual({ accounts_used: 8, topup_analyses: 0 })
  })

  it('IDEMPOTENT — rejoué deux fois, chaque débit indu est remboursé UNE fois (on compte)', async () => {
    await service.run(WS, { dryRun: false, actor: 'louis' })
    const second = await service.run(WS, { dryRun: false, actor: 'louis' })

    expect(refundRows(store)).toHaveLength(2)
    expect(store.subscriptions.get(OWNER)).toEqual({ accounts_used: 8, topup_analyses: 0 })
    expect(second.refunds).toEqual([])
    expect(second.alreadyRefunded).toEqual(['a2', 'a3'])
    expect(second.totalCredits).toBe(0)
  })

  it('un dryRun APRÈS le remboursement ne propose plus rien — la référence le prouve', async () => {
    await service.run(WS, { dryRun: false, actor: 'louis' })
    const preview = await service.run(WS, { dryRun: true, actor: 'louis' })
    expect(preview.refunds).toEqual([])
    expect(preview.alreadyRefunded).toEqual(['a2', 'a3'])
  })

  it('borné à UN espace : les débits indus d’un autre espace ne sont pas touchés', async () => {
    await service.run(WS, { dryRun: false, actor: 'louis' })
    const touched = refundRows(store).map(row => row['reason'])
    expect(touched).not.toContain(refreshRefundReason('signals', 'o2'))
    expect(refundRows(store).every(row => row['workspace_id'] === WS)).toBe(true)
  })

  it('sérialise deux gestes concurrents sur le même espace (verrou consultatif dans la transaction)', async () => {
    await service.run(WS, { dryRun: false, actor: 'louis' })
    expect(store.lockCalls).toHaveLength(1)
    expect(String(store.lockCalls[0]?.[0])).toContain('pg_advisory_xact_lock')
    expect(store.lockCalls[0]?.[1]).toEqual([`refresh-refund:${WS}`])
  })

  it('un solde déjà à zéro reçoit quand même le crédit — le registre ne ment jamais sur le solde', async () => {
    store.subscriptions.set(OWNER, { accounts_used: 1, topup_analyses: 0 })
    await service.run(WS, { dryRun: false, actor: 'louis' })
    // 2 crédits rendus : 1 efface la consommation du cycle, 1 part en recharge ponctuelle.
    expect(store.subscriptions.get(OWNER)).toEqual({ accounts_used: 0, topup_analyses: 1 })
    const set = store.updates[0]?.set ?? {}
    expect(set['accounts_used']?.()).toBe('GREATEST(accounts_used - :amount, 0)')
    expect(set['topup_analyses']?.()).toBe('topup_analyses + GREATEST(:amount - accounts_used, 0)')
  })

  it('sans abonnement à créditer, rien n’est écrit au registre et le débit est dit « non remboursé »', async () => {
    store.subscriptions.clear()
    const outcome = await service.run(WS, { dryRun: false, actor: 'louis' })
    expect(refundRows(store)).toHaveLength(0)
    expect(outcome.refunds).toEqual([])
    expect(outcome.skipped).toEqual([
      { debitId: 'a2', reason: 'no_subscription' },
      { debitId: 'a3', reason: 'no_subscription' },
    ])
  })

  it('un espace inconnu est un 404 — jamais un balayage silencieux', async () => {
    await expect(
      service.run('44444444-4444-4444-8444-444444444444', { dryRun: true, actor: 'louis' }),
    ).rejects.toBeInstanceOf(NotFoundException)
  })
})
