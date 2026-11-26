/**
 * manual-billing-mode.spec.ts — the invariants that keep an invoice-billed
 * (sales-led, no-Stripe) client alive.
 *
 * The whole system assumes Stripe is the source of truth for "is this workspace
 * entitled to anything". A manually-provisioned workspace has NO Stripe
 * subscription, and the failure mode is silent and delayed: everything looks
 * fine on provisioning day and the client is locked out four weeks later. Each
 * test below pins one path that could produce that.
 */
import type { ConfigService } from '@nestjs/config'
import type Stripe from 'stripe'
import { CreditsService, isTrialExpired } from './credits.service'
import type { StripeService } from '../stripe/stripe.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { PlanCatalogService } from './plan-catalog.service'
import { PlanDefinitionEntity } from '../../database/entities/plan-definition.entity'
import { AccountEntity } from '../../database/entities/account.entity'
import { CreditLedgerEntity } from '../../database/entities/credit-ledger.entity'
import { CreditReservationEntity } from '../../database/entities/credit-reservation.entity'
import { StripeEventEntity } from '../../database/entities/stripe-event.entity'
import { SubscriptionEntity } from '../../database/entities/subscription.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

const mockConfig = {
  get: (key: string) => {
    if (key === 'stripeSecretKey') return 'sk_test_fake'
    if (key === 'frontendUrl') return 'http://localhost:5173'
    return ''
  },
} as unknown as ConfigService

/** A live invoice-billed client: paid plan, manual mode, NO Stripe ids. */
const manualRow = (over: Partial<SubscriptionEntity> = {}): SubscriptionEntity =>
  ({
    user_id: 'owner-1',
    plan: 'team',
    accounts_limit: 50,
    accounts_used: 10,
    enrichment_credits: 100,
    stripe_customer_id: null,
    stripe_subscription_id: null,
    billing_mode: 'manual',
    trial_end: null,
    period_start: new Date('2026-07-01'),
    extra_seats: 7,
    ...over,
  }) as SubscriptionEntity

describe('manual (invoice-billed) workspaces', () => {
  let service: CreditsService
  let repo: MockRepository<SubscriptionEntity>
  let workspacesRepo: MockRepository<WorkspaceEntity>
  let membersRepo: MockRepository<WorkspaceMemberEntity>
  let stripeEventsRepo: MockRepository<StripeEventEntity>
  let createCustomer: jest.Mock
  let createSubscriptionCheckout: jest.Mock

  beforeEach(() => {
    repo = createMockRepository<SubscriptionEntity>()
    workspacesRepo = createMockRepository<WorkspaceEntity>()
    membersRepo = createMockRepository<WorkspaceMemberEntity>()
    stripeEventsRepo = createMockRepository<StripeEventEntity>()
    stripeEventsRepo._qb.execute.mockResolvedValue({ raw: [{ id: 'evt' }] })

    createCustomer = jest.fn().mockResolvedValue({ id: 'cus_new' })
    createSubscriptionCheckout = jest.fn().mockResolvedValue({ url: 'https://checkout.stripe.test/s' })

    const planCatalog = new PlanCatalogService(createMockRepository<PlanDefinitionEntity>() as never)
    service = new CreditsService(
      mockConfig,
      { createCustomer, createSubscriptionCheckout, listInvoices: jest.fn() } as unknown as StripeService,
      repo as never,
      createMockRepository<CreditLedgerEntity>() as never,
      createMockRepository<AccountEntity>() as never,
      workspacesRepo as never,
      membersRepo as never,
      stripeEventsRepo as never,
      createMockRepository<CreditReservationEntity>() as never,
      {
        resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
      } as unknown as WorkspaceContextService,
      planCatalog,
    )
  })

  describe('monthly quota reset — the silent-death path', () => {
    it('resets on the PLAN key, never on Stripe state, so a manual client refills', async () => {
      await service.resetElapsedMonthlyQuotas()

      // Four UPDATEs, one per paid plan key. If any of them ever grew a
      // `stripe_subscription_id IS NOT NULL` / `billing_mode` filter, an
      // invoice-billed client would run dry and never refill — and nobody would
      // notice until the client phoned, a month after the sale.
      const wheres = repo._qb.where.mock.calls.map(c => String(c[0]))
      expect(wheres).toHaveLength(4)
      for (const where of wheres) {
        expect(where).toContain('period_start')
        expect(where).not.toMatch(/stripe/i)
        expect(where).not.toMatch(/billing_mode/i)
      }
    })

    it('covers every plan a manual client can be provisioned on', async () => {
      await service.resetElapsedMonthlyQuotas()
      const plans = repo._qb.where.mock.calls.map(c => (c[1] as { plan: string }).plan)
      // `provision-client.dto.ts` restricts manual clients to exactly these keys
      // precisely because they are the ones the reset sweeps.
      expect(plans).toEqual(['starter', 'team', 'growth', 'beta'])
    })
  })

  describe('trial expiry — a manual client is not a trial', () => {
    it('never expires a paid manual row, whatever trial_end holds', () => {
      expect(isTrialExpired(manualRow())).toBe(false)
      // Even a stale window carried over from the client's own free trial.
      expect(isTrialExpired(manualRow({ trial_end: new Date('2020-01-01') }))).toBe(false)
    })

    it('reports the workspace as unlocked', async () => {
      repo.findOne.mockResolvedValue(manualRow())
      const credits = await service.getCredits('owner-1')
      expect(credits.trial_expired).toBe(false)
    })
  })

  describe('seats', () => {
    it('counts negotiated extra seats without any Stripe seat line', async () => {
      repo.findOne.mockResolvedValue(manualRow({ extra_seats: 7 }))
      membersRepo.count.mockResolvedValue(4)
      const credits = await service.getCredits('owner-1')
      // team = 3 included + 7 granted at provisioning.
      expect(credits.seats_total).toBe(10)
      expect(credits.seats_used).toBe(4)
    })
  })

  describe('billing mode is surfaced, not inferred', () => {
    it('reports billing_mode so the UI can say « facturé sur facture »', async () => {
      repo.findOne.mockResolvedValue(manualRow())
      const credits = await service.getCredits('owner-1')
      expect(credits.billing_mode).toBe('manual')
    })

    it('defaults a row with no explicit mode to stripe (pre-existing rows)', async () => {
      repo.findOne.mockResolvedValue({ ...manualRow(), billing_mode: undefined } as unknown as SubscriptionEntity)
      const credits = await service.getCredits('owner-1')
      expect(credits.billing_mode).toBe('stripe')
    })
  })

  describe('Stripe surfaces refuse to act on a manual client', () => {
    it('does not mint a Stripe customer for an invoice-billed client', async () => {
      repo.findOne.mockResolvedValue(manualRow())
      await expect(service.createSetupSession('owner-1', 'theo@skaizen.fr')).rejects.toThrow(/facturation manuelle/i)
      expect(createCustomer).not.toHaveBeenCalled()
    })

    it('blocks self-serve checkout so a manual client cannot double-subscribe', async () => {
      repo.findOne.mockResolvedValue(manualRow())
      // Without this, `checkout.session.completed` would overwrite the
      // negotiated caps with the catalog template and start a second charge.
      await expect(
        service.createCheckoutSession('owner-1', 'theo@skaizen.fr', { plan: 'team', annual: false }),
      ).rejects.toThrow(/facturation manuelle/i)
      expect(createSubscriptionCheckout).not.toHaveBeenCalled()
    })

    it('still lets a normal Stripe client check out', async () => {
      repo.findOne.mockResolvedValue({ ...manualRow(), billing_mode: 'stripe' } as SubscriptionEntity)
      await expect(
        service.createCheckoutSession('user-1', 'a@b.co', { plan: 'team', annual: false }),
      ).resolves.toBeDefined()
    })
  })

  describe('webhooks cannot clobber a manual row', () => {
    it('scopes subscription.updated to stripe-mode rows', async () => {
      repo.findOne.mockResolvedValue(null)
      await service.handleWebhookEvent({
        id: 'evt_1',
        type: 'customer.subscription.updated',
        data: { object: { id: 'sub_x', status: 'active', metadata: { plan: 'growth' } } },
      } as unknown as Stripe.Event)

      // Belt and braces. The UPDATE already matches `stripe_subscription_id =
      // :id` and a manual row holds SQL NULL, which never equals anything — but
      // that safety depends on nobody ever writing '' or 'manual' into the
      // column, and the UPDATE is not scoped by user_id. One mis-written
      // placeholder would zero EVERY manual client at once.
      const andWheres = repo._qb.andWhere.mock.calls.map(c => String(c[0]))
      expect(andWheres.some(w => /billing_mode/.test(w))).toBe(true)
    })

    it('scopes subscription.deleted (the lockout path) to stripe-mode rows', async () => {
      await service.handleWebhookEvent({
        id: 'evt_2',
        type: 'customer.subscription.deleted',
        data: { object: { id: 'sub_x' } },
      } as unknown as Stripe.Event)

      const andWheres = repo._qb.andWhere.mock.calls.map(c => String(c[0]))
      expect(andWheres.some(w => /billing_mode/.test(w))).toBe(true)
    })
  })

  describe('invoices', () => {
    it('returns an empty list for a manual client without calling Stripe', async () => {
      repo.findOne.mockResolvedValue(manualRow())
      const { invoices } = await service.listInvoices('owner-1')
      // Their real invoices live in the accounting tool; the app records the
      // terms (amount/period/reference) but issues no document.
      expect(invoices).toEqual([])
    })
  })
})
