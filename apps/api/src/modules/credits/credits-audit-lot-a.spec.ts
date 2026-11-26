import type { ConfigService } from '@nestjs/config'
import { CreditsService } from './credits.service'
import type { StripeService } from '../stripe/stripe.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { PlanCatalogService } from './plan-catalog.service'
import { PlanDefinitionEntity } from '../../database/entities/plan-definition.entity'
import { createMockRepository } from '../../database/test-utils'

/**
 * Audit BellumAI (13/10/2026) — lot A « crédits » : H3 (top-up crédité avant
 * encaissement) et M1 (remboursements / recharges / idempotence du webhook non
 * atomiques).
 *
 * La base est simulée en mémoire ; `manager.transaction` reproduit ce que fait
 * `pg_advisory_xact_lock` : deux sections critiques de même clé ne se
 * chevauchent jamais. Sans verrou, deux appels simultanés lisent le même état
 * « rien encore rendu / crédité » et agissent tous les deux.
 */
describe('CreditsService — audit lot A (H3, M1)', () => {
  const PACK = { id: 'analysis_10', label: '+10', resource: 'analysis', amount: 10, priceCents: 1000 }

  function build() {
    const repo = createMockRepository<object>()
    const ledgerRepo = createMockRepository<object>()
    const stripeEventsRepo = createMockRepository<object>()

    // --- état simulé -------------------------------------------------------
    const state = { accountsUsed: 8, topup: 0, ledger: [] as Array<Record<string, unknown>>, seen: new Set<string>() }
    const tick = () => new Promise<void>(r => setImmediate(r)) // laisse l'autre appel s'intercaler

    // Mutex par clé de verrou (= pg_advisory_xact_lock).
    const tails = new Map<string, Promise<unknown>>()
    repo.manager.transaction.mockImplementation(async (work: (m: unknown) => Promise<unknown>) => {
      let key = ''
      const tx = {
        query: async (_sql: string, params: string[]) => {
          key = params[0]
          const prev = tails.get(key) ?? Promise.resolve()
          let release!: () => void
          const mine = new Promise<void>(r => (release = r))
          tails.set(
            key,
            prev.then(() => mine),
          )
          await prev
          ;(tx as { release?: () => void }).release = release
          return []
        },
      }
      try {
        return await work(tx)
      } finally {
        ;(tx as { release?: () => void }).release?.()
      }
    })

    ledgerRepo.find.mockImplementation(async () => {
      await tick()
      return state.ledger.map(r => ({ ...r }))
    })
    ledgerRepo.insert.mockImplementation(async (row: Record<string, unknown>) => {
      await tick()
      state.ledger.push({ ...row, created_at: new Date() })
      return { identifiers: [{ id: `l-${state.ledger.length}` }] }
    })
    // Recharge : COUNT du ledger par « (checkout <eventId>) ».
    let needle = ''
    ledgerRepo._qb.andWhere.mockImplementation((_s: string, p: { needle: string }) => {
      needle = p.needle.replaceAll('%', '')
      return ledgerRepo._qb
    })
    ledgerRepo._qb.getCount.mockImplementation(async () => {
      await tick()
      return state.ledger.filter(r => r.kind === 'topup' && String(r.reason).includes(needle)).length
    })

    // UPDATE user_credits (remboursement ou recharge).
    repo._qb.set.mockImplementation((s: Record<string, () => string>) => {
      ;(repo._qb as unknown as { _set: typeof s })._set = s
      return repo._qb
    })
    repo._qb.execute.mockImplementation(async () => {
      await tick()
      const s = (repo._qb as unknown as { _set: Record<string, () => string> })._set
      if (s.accounts_used)
        state.accountsUsed = Math.max(state.accountsUsed - Number(/- (\d+)/.exec(s.accounts_used())?.[1]), 0)
      if (s.topup_analyses) state.topup += Number(/\+ (\d+)/.exec(s.topup_analyses())?.[1])
      return { affected: 1 }
    })

    stripeEventsRepo.findOne.mockImplementation(async ({ where }: { where: { id: string } }) => {
      await tick()
      return state.seen.has(where.id) ? { id: where.id } : null
    })
    stripeEventsRepo._qb.values.mockImplementation((v: { id: string }) => {
      state.seen.add(v.id)
      return stripeEventsRepo._qb
    })

    const planCatalog = new PlanCatalogService(createMockRepository<PlanDefinitionEntity>() as never)
    const service = new CreditsService(
      { get: (k: string) => (k === 'stripeSecretKey' ? 'sk_test_fake' : '') } as unknown as ConfigService,
      {} as unknown as StripeService,
      repo as never,
      ledgerRepo as never,
      createMockRepository() as never,
      createMockRepository() as never,
      createMockRepository() as never,
      stripeEventsRepo as never,
      createMockRepository() as never,
      {
        resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
      } as unknown as WorkspaceContextService,
      planCatalog,
    )
    jest
      .spyOn(service as unknown as { resolveTopupPack(id: string): unknown }, 'resolveTopupPack')
      .mockReturnValue(PACK)
    return { service, repo, ledgerRepo, state }
  }

  const topupEvent = (type: string, paymentStatus: string | undefined, id = 'evt_1') =>
    ({
      id,
      type,
      data: {
        object: {
          payment_status: paymentStatus,
          metadata: { userId: 'owner-1', topupPackId: 'analysis_10' },
        },
      },
    }) as never

  describe('H3 — un top-up ne se crédite qu’une fois PAYÉ', () => {
    it('checkout.session.completed en « unpaid » (SEPA, virement) : aucun crédit', async () => {
      const { service, state } = build()
      await service.handleWebhookEvent(topupEvent('checkout.session.completed', 'unpaid'))
      expect(state.topup).toBe(0)
      expect(state.ledger).toHaveLength(0)
    })

    it('checkout.session.completed en « paid » : crédite', async () => {
      const { service, state } = build()
      await service.handleWebhookEvent(topupEvent('checkout.session.completed', 'paid'))
      expect(state.topup).toBe(10)
      expect(state.ledger).toHaveLength(1)
    })

    it('checkout.session.async_payment_succeeded : crédite le paiement différé', async () => {
      const { service, state } = build()
      await service.handleWebhookEvent(topupEvent('checkout.session.async_payment_succeeded', 'paid', 'evt_async'))
      expect(state.topup).toBe(10)
    })

    it('unpaid puis async_payment_succeeded : crédité une seule fois', async () => {
      const { service, state } = build()
      await service.handleWebhookEvent(topupEvent('checkout.session.completed', 'unpaid', 'evt_a'))
      await service.handleWebhookEvent(topupEvent('checkout.session.async_payment_succeeded', 'paid', 'evt_b'))
      expect(state.topup).toBe(10)
    })

    it('checkout.session.async_payment_failed : aucun crédit', async () => {
      const { service, state } = build()
      await service.handleWebhookEvent(topupEvent('checkout.session.async_payment_failed', 'unpaid', 'evt_f'))
      expect(state.topup).toBe(0)
      expect(state.ledger).toHaveLength(0)
    })
  })

  describe('M1 — atomicité sous concurrence', () => {
    it('deux livraisons simultanées du MÊME événement : une seule recharge', async () => {
      const { service, state } = build()
      const event = topupEvent('checkout.session.completed', 'paid', 'evt_dup')
      await Promise.all([service.handleWebhookEvent(event), service.handleWebhookEvent(event)])
      expect(state.topup).toBe(10)
      expect(state.ledger.filter(r => r.kind === 'topup')).toHaveLength(1)
    })

    it('deux annulations simultanées : un seul remboursement, le quota du mois n’est pas effacé', async () => {
      const { service, state } = build()
      state.ledger.push({
        kind: 'consume_analysis',
        resource: 'analysis_slot',
        delta: -3,
        created_at: new Date(Date.now() - 1000),
      })
      state.accountsUsed = 10
      const call = () =>
        service.refundAnalysisSlot('owner-1', { accountId: 'acc-1', reason: 'annulation', requireLedgerDebit: true })
      await Promise.all([call(), call()])
      expect(state.ledger.filter(r => r.kind === 'refund_analysis')).toHaveLength(1)
      expect(state.accountsUsed).toBe(7)
    })

    it('recharge : si l’écriture du registre échoue, on ne crédite pas (le rejeu Stripe ne double-créditera pas)', async () => {
      const { service, state, ledgerRepo } = build()
      ledgerRepo.insert.mockRejectedValueOnce(new Error('ledger down'))
      await expect(
        service.handleWebhookEvent(topupEvent('checkout.session.completed', 'paid', 'evt_l')),
      ).rejects.toThrow('ledger down')
      expect(state.topup).toBe(0)
      // Le rejeu aboutit, une fois.
      await service.handleWebhookEvent(topupEvent('checkout.session.completed', 'paid', 'evt_l'))
      expect(state.topup).toBe(10)
    })
  })
})
