import type { ConfigService } from '@nestjs/config'
import {
  CREDIT_COSTS,
  CreditsService,
  isTrialExpired,
  nextResetFor,
  resolveAnalysisCost,
  resolveEnrichmentCost,
} from './credits.service'
import type { StripeService } from '../stripe/stripe.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import type { BudgetGateChecker } from '../workspace-budget/workspace-budget-tokens'
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
import { PLAN_CATALOG_DEFAULTS } from './plan-catalog.defaults'
import { DEMO_BILLING_ANNOUNCEMENTS_INTENTIONALLY_SILENT } from '../demo/demo-coverage'
import { SOFT_BRAKE_MESSAGE } from './soft-brake'

const mockConfig = {
  get: (key: string) => {
    if (key === 'stripeSecretKey') return 'sk_test_fake'
    if (key === 'frontendUrl') return 'http://localhost:5173'
    return ''
  },
} as unknown as ConfigService

/** Un `ConfigService` qui porte un seuil d'annonce explicite (D5) — le reste se
 *  comporte comme {@link mockConfig}. */
const configWithThreshold = (percent: unknown): ConfigService =>
  ({
    get: (key: string) => {
      if (key === 'creditLowThresholdPercent') return percent
      if (key === 'stripeSecretKey') return 'sk_test_fake'
      if (key === 'frontendUrl') return 'http://localhost:5173'
      return ''
    },
  }) as unknown as ConfigService

describe('CreditsService', () => {
  let service: CreditsService
  let repo: MockRepository<SubscriptionEntity>
  let ledgerRepo: MockRepository<CreditLedgerEntity>
  let accountsRepo: MockRepository<AccountEntity>
  let workspacesRepo: MockRepository<WorkspaceEntity>
  let membersRepo: MockRepository<WorkspaceMemberEntity>
  let stripeEventsRepo: MockRepository<StripeEventEntity>
  let resolveActiveWorkspace: jest.Mock
  let listInvoices: jest.Mock
  let createSubscriptionCheckout: jest.Mock
  let createOneShotCheckout: jest.Mock

  beforeEach(() => {
    repo = createMockRepository<SubscriptionEntity>()
    ledgerRepo = createMockRepository<CreditLedgerEntity>()
    accountsRepo = createMockRepository<AccountEntity>()
    workspacesRepo = createMockRepository<WorkspaceEntity>()
    membersRepo = createMockRepository<WorkspaceMemberEntity>()
    stripeEventsRepo = createMockRepository<StripeEventEntity>()
    // By default the webhook-event insert reports a fresh row (raw non-empty) so
    // the handler proceeds; the idempotency test overrides this to simulate a replay.
    stripeEventsRepo._qb.execute.mockResolvedValue({ raw: [{ id: 'evt' }] })
    // Default = solo user: the caller owns their workspace. `workspaces.findOne`
    // returns null so `resolveBillingSubscription` falls back to the caller id
    // (ownerUserId === userId), i.e. behaviour identical to per-user scoping.
    resolveActiveWorkspace = jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' })
    const workspaceContext = { resolveActiveWorkspace } as unknown as WorkspaceContextService
    listInvoices = jest.fn()
    createSubscriptionCheckout = jest.fn().mockResolvedValue({ url: 'https://checkout.stripe.test/s' })
    createOneShotCheckout = jest.fn().mockResolvedValue({ url: 'https://checkout.stripe.test/topup' })
    const mockStripe = { listInvoices, createSubscriptionCheckout, createOneShotCheckout } as unknown as StripeService
    // Real catalog over a mock repo whose `find` returns [] → falls back to the
    // shipped defaults, so all plan values are byte-identical to the old const.
    const planCatalog = new PlanCatalogService(createMockRepository<PlanDefinitionEntity>() as never)
    service = new CreditsService(
      mockConfig,
      mockStripe,
      repo as never,
      ledgerRepo as never,
      accountsRepo as never,
      workspacesRepo as never,
      membersRepo as never,
      stripeEventsRepo as never,
      createMockRepository<CreditReservationEntity>() as never,
      workspaceContext,
      planCatalog,
    )
  })

  describe('devise de facturation', () => {
    // Les tests de ce bloc espionnent le catalogue pour poser un prix déclaré.
    // Sans restauration, l'espion survivrait aux describes suivants et leur
    // ferait lire le palier Team partout — onze faux échecs pour une seule cause.
    afterEach(() => {
      jest.restoreAllMocks()
    })

    it('facture en euros par défaut — rien à déclarer, rien à convertir', async () => {
      await service.createCheckoutSession('user-1', 'a@b.co', { plan: 'team', annual: false })
      const arg = createSubscriptionCheckout.mock.calls[0][0]
      expect(arg.plan.currency).toBe('eur')
      expect(arg.plan.unitAmount).toBe(25900)
    })

    it('une devise SANS prix déclaré facture en euros, au prix euro — jamais une conversion', async () => {
      workspacesRepo.findOne.mockResolvedValue({ id: 'ws-1', billing_country: 'US' } as WorkspaceEntity)
      await service.createCheckoutSession('user-1', 'a@b.co', { plan: 'team', annual: false, currency: 'usd' })
      const arg = createSubscriptionCheckout.mock.calls[0][0]
      // Le pays dit « dollars », mais aucun prix n'est déclaré : on ne fabrique
      // pas un montant, on facture le prix euro en euros.
      expect(arg.plan.currency).toBe('eur')
      expect(arg.plan.unitAmount).toBe(25900)
    })

    it('facture au prix DÉCLARÉ quand l’opérateur l’a posé', async () => {
      jest.spyOn(PlanCatalogService.prototype, 'getOrDefault').mockResolvedValue({
        ...PLAN_CATALOG_DEFAULTS.team,
        prices: { usd: { priceCents: 29900, extraSeatPriceCents: 6900 } },
      })
      await service.createCheckoutSession('user-1', 'a@b.co', {
        plan: 'team',
        annual: false,
        currency: 'usd',
        extra_seats: 2,
      })
      const arg = createSubscriptionCheckout.mock.calls[0][0]
      expect(arg.plan.currency).toBe('usd')
      expect(arg.plan.unitAmount).toBe(29900)
      expect(arg.seatAddon.currency).toBe('usd')
      expect(arg.seatAddon.unitAmount).toBe(6900)
      expect(arg.metadata.currency).toBe('usd')
    })

    it('ce qui est DÉJÀ facturé gagne sur le choix du client — Stripe ne change pas la devise d’un abonnement', async () => {
      workspacesRepo.findOne.mockResolvedValue({
        id: 'ws-1',
        billing_currency: 'eur',
        billing_country: 'US',
      } as WorkspaceEntity)
      jest.spyOn(PlanCatalogService.prototype, 'getOrDefault').mockResolvedValue({
        ...PLAN_CATALOG_DEFAULTS.team,
        prices: { usd: { priceCents: 29900, extraSeatPriceCents: 6900 } },
      })
      const resolved = await service.resolveCheckoutCurrency('user-1', 'usd')
      expect(resolved).toEqual({ currency: 'eur', locked: true })

      await service.createCheckoutSession('user-1', 'a@b.co', { plan: 'team', annual: false, currency: 'usd' })
      expect(createSubscriptionCheckout.mock.calls[0][0].plan.currency).toBe('eur')
    })

    it('le pays de FACTURATION décide, pas le marché prospecté', async () => {
      // `market` reste ce que l'espace prospecte : le lire ici facturerait en
      // dollars une ESN française qui prospecte les États-Unis.
      workspacesRepo.findOne.mockResolvedValue({ id: 'ws-1', market: 'US', billing_country: null } as WorkspaceEntity)
      await expect(service.resolveCheckoutCurrency('user-1', null)).resolves.toEqual({
        currency: 'eur',
        locked: false,
      })
    })
  })

  describe('createCheckoutSession', () => {
    it('bills monthly by default (plan price, month interval)', async () => {
      await service.createCheckoutSession('user-1', 'a@b.co', { plan: 'team', annual: false })
      const arg = createSubscriptionCheckout.mock.calls[0][0]
      expect(arg.plan.unitAmount).toBe(25900) // team = 259€/mo, in cents
      expect(arg.plan.interval).toBe('month')
      expect(arg.metadata.interval).toBe('month')
    })

    it('bills annually at -20% x12, rounded to whole euros, year interval', async () => {
      await service.createCheckoutSession('user-1', 'a@b.co', { plan: 'team', annual: true })
      const arg = createSubscriptionCheckout.mock.calls[0][0]
      // round(259 * 0.8 * 12) = 2486€ → 248600 cents (proposal §3: Team 2 486 €/an)
      expect(arg.plan.unitAmount).toBe(248600)
      expect(arg.plan.interval).toBe('year')
      expect(arg.metadata.interval).toBe('year')
    })

    it('computes the annual amount for starter too', async () => {
      await service.createCheckoutSession('user-1', 'a@b.co', { plan: 'starter', annual: true })
      // round(119 * 0.8 * 12) = 1142€ → 114200 cents (proposal §3: 1 142 €/an)
      expect(createSubscriptionCheckout.mock.calls[0][0].plan.unitAmount).toBe(114200)
    })

    it('computes the annual amount for growth (199 € × 0,8 × 12 = 1 910 €/an)', async () => {
      await service.createCheckoutSession('user-1', 'a@b.co', { plan: 'growth', annual: true })
      // round(199 * 0.8 * 12) = 1910€ → 191000 cents
      expect(createSubscriptionCheckout.mock.calls[0][0].plan.unitAmount).toBe(191000)
    })

    it('names the Stripe product from the plan label, whatever it is', async () => {
      await service.createCheckoutSession('user-1', 'a@b.co', { plan: 'starter', annual: false })
      // Le libellé vient du catalogue : le figer en dur ici ferait diverger la
      // ligne Stripe du nom affiché à l'écran le jour où l'opérateur le change.
      expect(createSubscriptionCheckout.mock.calls[0][0].plan.name).toBe('BellumAI Starter')
    })

    it('adds a seat add-on line item (server-priced) when extra_seats > 0', async () => {
      await service.createCheckoutSession('user-1', 'a@b.co', { plan: 'team', annual: false, extra_seats: 2 })
      const arg = createSubscriptionCheckout.mock.calls[0][0]
      // Le siège suit le palier : 59 € sur Team (29 € sur Starter-Solo, 99 € sur Growth).
      expect(arg.seatAddon).toMatchObject({ unitAmount: 5900, quantity: 2, interval: 'month' })
      expect(arg.metadata.extra_seats).toBe('2')
    })

    it("the seat add-on names the plan's OWN included allowance (varies per tier)", async () => {
      await service.createCheckoutSession('user-1', 'a@b.co', { plan: 'starter', annual: false, extra_seats: 2 })
      expect(createSubscriptionCheckout.mock.calls[0][0].seatAddon.description).toContain(
        'au-delà des 1 siège(s) inclus',
      )

      createSubscriptionCheckout.mockClear()
      await service.createCheckoutSession('user-1', 'a@b.co', { plan: 'growth', annual: false, extra_seats: 1 })
      expect(createSubscriptionCheckout.mock.calls[0][0].seatAddon.description).toContain(
        'au-delà des 1 siège(s) inclus',
      )
    })

    it('prices the seat add-on annually too (−20 % ×12)', async () => {
      await service.createCheckoutSession('user-1', 'a@b.co', { plan: 'team', annual: true, extra_seats: 1 })
      // round(59 * 0.8 * 12) = 566€ → 56600 cents
      expect(createSubscriptionCheckout.mock.calls[0][0].seatAddon.unitAmount).toBe(56600)
    })

    it('caps extra_seats and omits the add-on when none requested', async () => {
      await service.createCheckoutSession('user-1', 'a@b.co', { plan: 'team', annual: false })
      expect(createSubscriptionCheckout.mock.calls[0][0].seatAddon).toBeUndefined()
    })
  })

  describe('getPlanConfig (grille validée — pricing-proposal §3, VALIDÉ Louis 16/07)', () => {
    it('returns all plan configs including the reserved beta and découverte plans', async () => {
      const plans = await service.getPlanConfig()
      expect(Object.keys(plans)).toEqual(['trial', 'starter', 'team', 'growth', 'beta', 'decouverte'])
    })

    it('découverte = un palier NOMMÉ et zéro crédit — il n’ouvre plus rien', async () => {
      // Le palier survit pour que l'écran de facturation puisse nommer un compte
      // sans licence, au lieu de le rabattre sur « Starter ». Son quota, lui, est
      // à zéro depuis le 02/09/2026.
      const plans = await service.getPlanConfig()
      expect(plans.decouverte).toEqual(
        expect.objectContaining({ label: 'Découverte', price: 0, accounts_limit: 0, enrichment_credits: 0 }),
      )
    })

    it('implements the validated grid (price + quotas + included seats per tier)', async () => {
      const plans = await service.getPlanConfig()
      expect(plans.starter).toEqual({
        label: 'Starter',
        price: 11900,
        accounts_limit: 80,
        enrichment_credits: 0,
        seats: 1,
        extra_seat_price: 3900,
        // La grille de features voyage avec le plan : l'écran de facturation en
        // fait ses puces au lieu d'une promesse écrite à la main.
        features: [...PLAN_CATALOG_DEFAULTS.starter.features],
      })
      expect(plans.team).toEqual({
        label: 'Team / Enterprise',
        price: 25900,
        accounts_limit: 600,
        enrichment_credits: 0,
        seats: 3,
        extra_seat_price: 5900,
        features: [...PLAN_CATALOG_DEFAULTS.team.features],
      })
      expect(plans.growth).toEqual({
        label: 'Growth',
        price: 19900,
        accounts_limit: 250,
        enrichment_credits: 0,
        seats: 1,
        extra_seat_price: 0,
        features: [...PLAN_CATALOG_DEFAULTS.growth.features],
      })
    })

    it('l’offre Bêta Design Partner : 119 € par licence, volume Team, jamais sur l’écran public (§11)', async () => {
      const plans = await service.getPlanConfig()
      expect(plans.beta).toEqual({
        label: 'Bêta Design Partner',
        price: 11900,
        accounts_limit: 600,
        enrichment_credits: 0,
        seats: 3,
        extra_seat_price: 2900,
        features: [...PLAN_CATALOG_DEFAULTS.beta.features],
      })
    })

    it('donne ZÉRO crédit au palier `trial` — ce n’est plus un essai, c’est l’état verrouillé', async () => {
      // 02/09/2026 : il n'y a plus d'essai gratuit. `trial` survit comme code de
      // palier (des lignes en base le portent, et la résiliation d'un abonnement
      // s'y rabat déjà) mais il n'ouvre plus rien.
      const plans = await service.getPlanConfig()
      expect(plans.trial.accounts_limit).toBe(0)
      expect(plans.trial.enrichment_credits).toBe(0)
      expect(plans.trial.price).toBe(0)
      expect(plans.trial.seats).toBe(3)
    })

    it('donne ZÉRO crédit au palier `decouverte` — un compte neuf n’a pas de licence', async () => {
      const plans = await service.getPlanConfig()
      expect(plans.decouverte.accounts_limit).toBe(0)
      expect(plans.decouverte.price).toBe(0)
    })
  })

  describe('CREDIT_COSTS grid (roadmap — per-action credit cost)', () => {
    it('Louis 10/10 — facture une analyse complète 10 crédits (Approfondie, le défaut), quel que soit le périmètre (§9)', () => {
      // Le périmètre change ce qu'on collecte, pas le fait qu'on produise un
      // dossier complet. C'est le REFRESH, action distincte, qui coûte moins.
      for (const scope of ['france', 'groupe', 'filiales', 'it_digital', 'startups', 'custom'] as const) {
        expect(resolveAnalysisCost(scope)).toBe(10)
      }
    })

    it('un périmètre inconnu retombe sur le prix PLEIN, jamais sur 1', () => {
      // Sous-facturer par défaut est la seule erreur que la grille ne rattrape
      // pas : un périmètre non reconnu offrirait un dossier complet à un
      // huitième de son coût.
      expect(resolveAnalysisCost(undefined)).toBe(10)
      expect(resolveAnalysisCost(null)).toBe(10)
    })

    it('APPLIQUE la grille : un périmètre plus cher résout à sa valeur', () => {
      // Le point d'injection prouve que le mécanisme honore un périmètre plus
      // cher SANS toucher la grille de production. Un fan-out multi-entités se
      // facture en changeant une valeur, pas le chemin de débit.
      const costlyGrid = { ...CREDIT_COSTS.analysis.byScope, groupe: 12 }
      expect(resolveAnalysisCost('groupe', 0, costlyGrid)).toBe(15)
      // Les autres périmètres de la même grille restent au prix standard.
      expect(resolveAnalysisCost('france', 0, costlyGrid)).toBe(10)
    })

    it('normalises a bad grid value to a safe positive integer', () => {
      expect(resolveAnalysisCost('groupe', 0, { groupe: 0 })).toBe(1)
      expect(resolveAnalysisCost('groupe', 0, { groupe: -3 })).toBe(1)
      expect(resolveAnalysisCost('groupe', 0, { groupe: 2.9 })).toBe(3)
    })

    // #2163.76 — ce qui est EXCLU réduit le prix, un crédit par exclusion,
    // JAMAIS gratuit pour autant (plancher à 1).
    it('#2163.76 — réduit le prix d’un crédit par entité écartée', () => {
      expect(resolveAnalysisCost('groupe', 2)).toBe(8)
      expect(resolveAnalysisCost('groupe', 5)).toBe(5)
    })

    it('#2163.76 — plancher à 1, jamais une analyse gratuite même à exclusion maximale', () => {
      expect(resolveAnalysisCost('groupe', 30)).toBe(1)
    })

    it('#2163.76 — excludedCount absent/0 reste byte-identique au prix plein', () => {
      expect(resolveAnalysisCost('groupe')).toBe(10)
      expect(resolveAnalysisCost('groupe', 0)).toBe(10)
    })

    it('#2163.76 — un excludedCount invalide (NaN, négatif) ne fait rien gagner', () => {
      expect(resolveAnalysisCost('groupe', Number.NaN)).toBe(10)
      expect(resolveAnalysisCost('groupe', -5)).toBe(10)
    })

    it('prices a contact enrichment at 1 (the only type today)', () => {
      expect(resolveEnrichmentCost('contact')).toBe(1)
      expect(resolveEnrichmentCost()).toBe(1)
      expect(CREDIT_COSTS.enrichment.contact).toBe(1)
    })
  })

  describe('consumeAnalysisSlot — cost grid', () => {
    it('débite le prix PLEIN d’une analyse par défaut (delta -10, SQL + 10)', async () => {
      repo._qb.execute.mockResolvedValueOnce({ affected: 1 })
      repo.findOne.mockResolvedValueOnce({ accounts_used: 3, accounts_limit: 40 } as SubscriptionEntity)

      await service.consumeAnalysisSlot('solo-1', { scopeMode: 'france' })

      const setArg = repo._qb.set.mock.calls[0][0] as { accounts_used: () => string }
      expect(setArg.accounts_used()).toBe('accounts_used + 10')
      expect(repo._qb.where.mock.calls[0][0]).toContain('accounts_used + 10 <= accounts_limit')
      expect(ledgerRepo.insert).toHaveBeenCalledWith(expect.objectContaining({ kind: 'consume_analysis', delta: -10 }))
    })

    it('debits N slots when the resolved cost is N (explicit cost:2)', async () => {
      repo._qb.execute.mockResolvedValueOnce({ affected: 1 })
      repo.findOne.mockResolvedValueOnce({ accounts_used: 5, accounts_limit: 40 } as SubscriptionEntity)

      const res = await service.consumeAnalysisSlot('solo-1', { cost: 2 })

      const setArg = repo._qb.set.mock.calls[0][0] as { accounts_used: () => string }
      expect(setArg.accounts_used()).toBe('accounts_used + 2')
      expect(repo._qb.where.mock.calls[0][0]).toContain('accounts_used + 2 <= accounts_limit')
      expect(ledgerRepo.insert).toHaveBeenCalledWith(expect.objectContaining({ kind: 'consume_analysis', delta: -2 }))
      expect(res.ok).toBe(true)
    })

    it('REFUSE un utilisateur sans ligne d’abonnement, quel que soit le coût demandé', async () => {
      repo._qb.execute.mockResolvedValueOnce({ affected: 0 })
      repo.findOne.mockResolvedValueOnce(null)

      const res = await service.consumeAnalysisSlot('new-user', { cost: 2 })

      expect(res).toEqual({ ok: false, used: 0, limit: 0 })
      // Rien n'a été consommé, donc rien ne s'écrit au journal : une ligne de
      // débit pour une action refusée fausserait la reddition de comptes.
      expect(ledgerRepo.insert).not.toHaveBeenCalled()
    })
  })

  /**
   * CREDIT-01 (audit terrain 17/08) : un run qui échoue ne doit laisser AUCUN
   * débit net. Le remboursement rendait `1` alors que l'analyse en prend 8 —
   * sept crédits perdus sur un dossier jamais rendu.
   */
  describe('refundAnalysisSlot — la course annulation / onFailed (#4123)', () => {
    /** Un registre qui se comporte comme l'index unique partiel : la 1re réservation d'un débit gagne. */
    const fakeUniqueLedger = () => {
      const claimed = new Set<string>()
      let seq = 0
      ledgerRepo._qb.values.mockImplementation(((row: { refunds_ledger_id: string }) => {
        ledgerRepo._qb.execute.mockImplementationOnce(async () => {
          if (claimed.has(row.refunds_ledger_id)) return { raw: [] }
          claimed.add(row.refunds_ledger_id)
          return { raw: [{ id: `refund-${++seq}` }] }
        })
        return ledgerRepo._qb
      }) as never)
      return claimed
    }
    const debit = (id: string) => ({ id, kind: 'consume_analysis', resource: 'analysis_slot', delta: -8 }) as never

    it("deux appels simultanés sur le même run ne rendent les crédits qu'une fois", async () => {
      fakeUniqueLedger()
      // Les deux appelants lisent le registre AVANT que l'un n'écrive : tous deux voient 8 à rendre.
      ledgerRepo.find.mockResolvedValue([debit('debit-1')])
      repo._qb.execute.mockResolvedValue({ affected: 1 })

      await Promise.all([
        service.refundAnalysisSlot('solo-1', { accountId: 'acc-1', reason: 'annulation' }),
        service.refundAnalysisSlot('solo-1', { accountId: 'acc-1', reason: 'échec run' }),
      ])

      expect(repo._qb.execute).toHaveBeenCalledTimes(1)
      expect(ledgerRepo._qb.values).toHaveBeenCalledTimes(2)
      expect(ledgerRepo._qb.values).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'refund_analysis', delta: 8, refunds_ledger_id: 'debit-1' }),
      )
    })

    it('deux runs différents = deux remboursements', async () => {
      fakeUniqueLedger()
      repo._qb.execute.mockResolvedValue({ affected: 1 })

      ledgerRepo.find.mockResolvedValueOnce([debit('debit-1')])
      await service.refundAnalysisSlot('solo-1', { accountId: 'acc-1' })
      ledgerRepo.find.mockResolvedValueOnce([debit('debit-2')])
      await service.refundAnalysisSlot('solo-1', { accountId: 'acc-1' })

      expect(repo._qb.execute).toHaveBeenCalledTimes(2)
    })

    it("rend la réservation quand le compteur n'a pas bougé", async () => {
      fakeUniqueLedger()
      ledgerRepo.find.mockResolvedValueOnce([debit('debit-1')])
      repo._qb.execute.mockResolvedValueOnce({ affected: 0 })

      await service.refundAnalysisSlot('solo-1', { accountId: 'acc-1' })

      expect(ledgerRepo.delete).toHaveBeenCalledWith({ id: 'refund-1' })
    })

    it('une erreur du registre (hors conflit) ne bloque pas le remboursement', async () => {
      ledgerRepo._qb.execute.mockRejectedValueOnce(new Error('db down'))
      ledgerRepo.find.mockResolvedValueOnce([debit('debit-1')])
      repo._qb.execute.mockResolvedValueOnce({ affected: 1 })

      await service.refundAnalysisSlot('solo-1', { accountId: 'acc-1' })

      expect(repo._qb.execute).toHaveBeenCalledTimes(1)
      expect(ledgerRepo.insert).toHaveBeenCalledWith(expect.objectContaining({ kind: 'refund_analysis', delta: 8 }))
    })
  })

  describe('refundAnalysisSlot — le montant réellement débité, une seule fois', () => {
    it('rend ce que le registre dit avoir été débité (8, pas 1)', async () => {
      ledgerRepo.find.mockResolvedValueOnce([
        { kind: 'consume_analysis', resource: 'analysis_slot', delta: -8 } as never,
      ])
      repo._qb.execute.mockResolvedValueOnce({ affected: 1 })

      await service.refundAnalysisSlot('solo-1', { accountId: 'acc-1', reason: 'échec run' })

      const setArg = repo._qb.set.mock.calls[0][0] as { accounts_used: () => string }
      expect(setArg.accounts_used()).toBe('GREATEST(accounts_used - 8, 0)')
      expect(ledgerRepo.insert).toHaveBeenCalledWith(expect.objectContaining({ kind: 'refund_analysis', delta: 8 }))
    })

    it('ne rembourse pas deux fois : un second passage est sans effet', async () => {
      ledgerRepo.find.mockResolvedValueOnce([
        { kind: 'consume_analysis', resource: 'analysis_slot', delta: -8 } as never,
        { kind: 'refund_analysis', resource: 'analysis_slot', delta: 8 } as never,
      ])

      await service.refundAnalysisSlot('solo-1', { accountId: 'acc-1' })

      expect(repo._qb.set).not.toHaveBeenCalled()
      expect(ledgerRepo.insert).not.toHaveBeenCalled()
    })

    it('rembourse le solde restant quand un remboursement partiel a déjà eu lieu', async () => {
      ledgerRepo.find.mockResolvedValueOnce([
        { kind: 'consume_analysis', resource: 'analysis_slot', delta: -8 } as never,
        { kind: 'refund_analysis', resource: 'analysis_slot', delta: 1 } as never,
      ])
      repo._qb.execute.mockResolvedValueOnce({ affected: 1 })

      await service.refundAnalysisSlot('solo-1', { accountId: 'acc-1' })

      const setArg = repo._qb.set.mock.calls[0][0] as { accounts_used: () => string }
      expect(setArg.accounts_used()).toBe('GREATEST(accounts_used - 7, 0)')
    })

    it("sans ligne au registre, rend le coût annoncé par l'appelant", async () => {
      ledgerRepo.find.mockResolvedValueOnce([])
      repo._qb.execute.mockResolvedValueOnce({ affected: 1 })

      await service.refundAnalysisSlot('solo-1', { accountId: 'acc-1', cost: 4 })

      const setArg = repo._qb.set.mock.calls[0][0] as { accounts_used: () => string }
      expect(setArg.accounts_used()).toBe('GREATEST(accounts_used - 4, 0)')
    })

    it('ne rend QUE le dernier run : un dossier déjà livré n’est pas remboursé avec lui', async () => {
      // Un compte se relance. Son registre porte donc autant de débits que de
      // runs. En sommant, un compte analysé (dossier livré, 8 crédits pris à
      // juste titre) puis relancé et annulé rendait 16 crédits — dont ceux du
      // dossier que le commercial garde sous les yeux.
      ledgerRepo.find.mockResolvedValueOnce([
        {
          kind: 'consume_analysis',
          resource: 'analysis_slot',
          delta: -8,
          created_at: new Date('2026-08-01T10:00:00Z'),
        } as never,
        {
          kind: 'consume_analysis',
          resource: 'analysis_slot',
          delta: -8,
          created_at: new Date('2026-08-18T23:13:00Z'),
        } as never,
      ])
      repo._qb.execute.mockResolvedValueOnce({ affected: 1 })

      await service.refundAnalysisSlot('solo-1', { accountId: 'acc-1', reason: 'annulation' })

      const setArg = repo._qb.set.mock.calls[0][0] as { accounts_used: () => string }
      expect(setArg.accounts_used()).toBe('GREATEST(accounts_used - 8, 0)')
    })

    it('un remboursement ANTÉRIEUR au dernier débit ne l’acquitte pas', async () => {
      ledgerRepo.find.mockResolvedValueOnce([
        {
          kind: 'consume_analysis',
          resource: 'analysis_slot',
          delta: -8,
          created_at: new Date('2026-08-01T10:00:00Z'),
        } as never,
        {
          kind: 'refund_analysis',
          resource: 'analysis_slot',
          delta: 8,
          created_at: new Date('2026-08-01T10:05:00Z'),
        } as never,
        {
          kind: 'consume_analysis',
          resource: 'analysis_slot',
          delta: -8,
          created_at: new Date('2026-08-18T23:13:00Z'),
        } as never,
      ])
      repo._qb.execute.mockResolvedValueOnce({ affected: 1 })

      await service.refundAnalysisSlot('solo-1', { accountId: 'acc-1' })

      const setArg = repo._qb.set.mock.calls[0][0] as { accounts_used: () => string }
      expect(setArg.accounts_used()).toBe('GREATEST(accounts_used - 8, 0)')
    })

    it('`requireLedgerDebit` : sans débit rattaché au compte, on ne rend RIEN', async () => {
      // Le cas visé : un run lancé par l'opérateur (`force`) n'a jamais rien
      // coûté au client. Lui créditer le tarif par défaut lui offrirait des
      // crédits qu'il n'a pas payés.
      ledgerRepo.find.mockResolvedValueOnce([])

      await service.refundAnalysisSlot('solo-1', { accountId: 'acc-1', requireLedgerDebit: true })

      expect(repo._qb.set).not.toHaveBeenCalled()
      expect(ledgerRepo.insert).not.toHaveBeenCalled()
    })

    it('sans compte (échec avant création), rend le coût annoncé — défaut = analyse complète', async () => {
      repo._qb.execute.mockResolvedValueOnce({ affected: 1 })

      await service.refundAnalysisSlot('solo-1', { reason: 'échec création' })

      const setArg = repo._qb.set.mock.calls[0][0] as { accounts_used: () => string }
      expect(setArg.accounts_used()).toBe('GREATEST(accounts_used - 8, 0)')
      expect(ledgerRepo.find).not.toHaveBeenCalled()
    })
  })

  /**
   * MONNAIE UNIQUE (décision produit Louis, 23/07) : un crédit vaut UNE action,
   * quelle qu'elle soit. Un enrichissement débite donc le MÊME pool qu'une
   * analyse — plus deux monnaies, plus deux soldes, plus « il me reste des
   * enrichissements mais plus d'analyses ».
   */
  describe('rattacher le débit à son compte (ce qui rend le remboursement exact)', () => {
    it('marque la ligne de registre du lancement avec le compte qu’elle a payé', async () => {
      await service.attachAnalysisDebit('ledger-1', 'acc-1')

      expect(ledgerRepo.update).toHaveBeenCalledWith({ id: 'ledger-1' }, { account_id: 'acc-1' })
    })

    it('sans id de ligne (écriture de registre ratée), ne touche à rien', async () => {
      await service.attachAnalysisDebit(null, 'acc-1')

      expect(ledgerRepo.update).not.toHaveBeenCalled()
    })

    it('un débit non remboursé se lit « encore payé » — la reprise reste gratuite', async () => {
      ledgerRepo.find.mockResolvedValueOnce([
        {
          kind: 'consume_analysis',
          resource: 'analysis_slot',
          delta: -8,
          created_at: new Date('2026-08-18T23:13:00Z'),
        } as never,
      ])

      await expect(service.hasOutstandingAnalysisDebit('solo-1', 'acc-1')).resolves.toBe(true)
    })

    it('un débit déjà remboursé se lit « plus payé » — la reprise redébite', async () => {
      ledgerRepo.find.mockResolvedValueOnce([
        {
          kind: 'consume_analysis',
          resource: 'analysis_slot',
          delta: -8,
          created_at: new Date('2026-08-18T23:13:00Z'),
        } as never,
        {
          kind: 'refund_analysis',
          resource: 'analysis_slot',
          delta: 8,
          created_at: new Date('2026-08-18T23:20:00Z'),
        } as never,
      ])

      await expect(service.hasOutstandingAnalysisDebit('solo-1', 'acc-1')).resolves.toBe(false)
    })

    it('aucun débit connu ⇒ on ne fait PAS payer une deuxième fois', async () => {
      ledgerRepo.find.mockResolvedValueOnce([])

      await expect(service.hasOutstandingAnalysisDebit('solo-1', 'acc-1')).resolves.toBe(true)
    })
  })

  describe('consumeEnrichmentCredit — pool unique', () => {
    it('débite le pool de crédits du cycle, pas une seconde monnaie', async () => {
      repo._qb.execute.mockResolvedValueOnce({ affected: 1 })
      repo.findOne.mockResolvedValueOnce({
        accounts_limit: 10,
        accounts_used: 1,
        topup_analyses: 0,
      } as SubscriptionEntity)

      await service.consumeEnrichmentCredit('solo-1', { type: 'contact' })

      const setArg = repo._qb.set.mock.calls[0][0] as { accounts_used: () => string }
      // Un enrichissement reste à 1 : c'est l'unité de référence de la grille
      // pondérée, celle à laquelle les autres actions se comparent.
      expect(setArg.accounts_used()).toBe('accounts_used + 1')
      // Le plafond est celui du cycle — quota du plan + recharge ponctuelle.
      expect(repo._qb.where.mock.calls[0][0]).toContain('accounts_used + 1 <= accounts_limit + topup_analyses')
      expect(ledgerRepo.insert).toHaveBeenCalledWith(expect.objectContaining({ kind: 'consume_enrichment', delta: -1 }))
    })

    it('honore un coût explicite sur le même pool', async () => {
      repo._qb.execute.mockResolvedValueOnce({ affected: 1 })
      repo.findOne.mockResolvedValueOnce({
        accounts_limit: 10,
        accounts_used: 3,
        topup_analyses: 0,
      } as SubscriptionEntity)

      await service.consumeEnrichmentCredit('solo-1', { cost: 3 })

      const setArg = repo._qb.set.mock.calls[0][0] as { accounts_used: () => string }
      expect(setArg.accounts_used()).toBe('accounts_used + 3')
      expect(repo._qb.where.mock.calls[0][0]).toContain('accounts_used + 3 <= accounts_limit + topup_analyses')
      expect(ledgerRepo.insert).toHaveBeenCalledWith(expect.objectContaining({ kind: 'consume_enrichment', delta: -3 }))
    })

    it('rend le solde RESTANT du pool, pas un compteur d’enrichissements', async () => {
      repo._qb.execute.mockResolvedValueOnce({ affected: 1 })
      repo.findOne.mockResolvedValueOnce({
        accounts_limit: 10,
        accounts_used: 4,
        topup_analyses: 2,
      } as SubscriptionEntity)

      const res = await service.consumeEnrichmentCredit('solo-1')

      // 10 + 2 - 4 = 8 crédits restants.
      expect(res).toEqual({ ok: true, remaining: 8 })
    })

    it('refuse quand le pool est vide (le serveur reste la borne)', async () => {
      repo._qb.execute.mockResolvedValueOnce({ affected: 0 })

      const res = await service.consumeEnrichmentCredit('solo-1')

      expect(res).toEqual({ ok: false, remaining: 0 })
      expect(ledgerRepo.insert).not.toHaveBeenCalled()
    })
  })

  describe("#3400 — le refus d'enrichissement dit la VRAIE cause, jamais « crédits épuisés » à tort", () => {
    const expired = () => ({
      user_id: 'solo-1',
      plan: 'decouverte',
      accounts_limit: 65,
      accounts_used: 0,
      topup_analyses: 0,
      trial_end: new Date(Date.now() - 1000),
    })

    it("hasEnrichmentCredit refuse une fenêtre d'essai fermée, comme le débit atomique (même règle des deux côtés)", async () => {
      repo.findOne.mockResolvedValueOnce(expired() as unknown as SubscriptionEntity)
      expect(await service.hasEnrichmentCredit('solo-1')).toBe(false)
    })

    it("débit refusé avec 65 crédits affichés : la raison nomme la période d'essai, pas des crédits épuisés", async () => {
      repo._qb.execute.mockResolvedValueOnce({ affected: 0 })
      repo.findOne.mockResolvedValueOnce(expired() as unknown as SubscriptionEntity)
      const res = await service.consumeEnrichmentCredit('solo-1')
      expect(res.ok).toBe(false)
      expect(res.reason).toMatch(/période d'essai/i)
      expect(res.reason).not.toMatch(/épuisés/i)
    })

    it('débit refusé alors que le solde est > 0 sans fenêtre fermée : « momentanément indisponible, rien consommé » (#4464)', async () => {
      repo._qb.execute.mockResolvedValueOnce({ affected: 0 })
      repo.findOne.mockResolvedValueOnce({
        user_id: 'solo-1',
        plan: 'team',
        accounts_limit: 100,
        accounts_used: 35,
      } as SubscriptionEntity)
      const res = await service.consumeEnrichmentCredit('solo-1')
      expect(res.ok).toBe(false)
      expect(res.reason).toMatch(/momentanément indisponible/i)
      expect(res.reason).not.toMatch(/crédit/i) // #4464 — crédits implicites
      expect(res.reason).toMatch(/rien n'a été consommé/i)
    })

    // #3400 (« confirmer en prod la cause réelle sur ce compte ») — le diagnostic d'opérateur
    // rend, en LECTURE SEULE, la cause que le refus aurait donnée, sans rien débiter.
    describe('enrichmentDiagnostic — la cause réelle, lue sur le pool, sans débit', () => {
      it("fenêtre d'essai fermée avec 65 crédits : cause `trial_ended`, la porte amont refuse, rien n'est écrit", async () => {
        repo.findOne.mockResolvedValue(expired() as unknown as SubscriptionEntity)
        const diag = await service.enrichmentDiagnostic('solo-1')
        expect(diag).toMatchObject({
          cause: 'trial_ended',
          plan: 'decouverte',
          creditsRemaining: 65,
          trialExpired: true,
          preCheckAllows: false,
          isDemo: false,
        })
        expect(repo._qb.execute).not.toHaveBeenCalled()
        expect(ledgerRepo.insert).not.toHaveBeenCalled()
      })

      it('aucune ligne de pool : cause `no_subscription`, jamais un solde inventé', async () => {
        repo.findOne.mockResolvedValue(null)
        expect(await service.enrichmentDiagnostic('solo-1')).toMatchObject({
          cause: 'no_subscription',
          plan: null,
          creditsRemaining: 0,
        })
      })

      it('solde vide sur un plan payant : cause `pool_empty`', async () => {
        repo.findOne.mockResolvedValue({
          user_id: 'solo-1',
          plan: 'team',
          accounts_limit: 10,
          accounts_used: 10,
        } as SubscriptionEntity)
        expect((await service.enrichmentDiagnostic('solo-1')).cause).toBe('pool_empty')
      })

      it('solde > 0, essai ouvert, aucune porte : cause `none` — le débit passerait', async () => {
        repo.findOne.mockResolvedValue({
          user_id: 'solo-1',
          plan: 'team',
          accounts_limit: 100,
          accounts_used: 35,
        } as SubscriptionEntity)
        const diag = await service.enrichmentDiagnostic('solo-1')
        expect(diag).toMatchObject({ cause: 'none', creditsRemaining: 65, preCheckAllows: true })
      })

      it("porte de budget d'espace fermée : cause `workspace_budget`, la limite est NOMMÉE", async () => {
        const budgetGate = jest.fn().mockResolvedValue({
          allowed: false,
          overCap: 'workspace_budget',
          message: 'Le budget mensuel de cet espace est atteint.',
        })
        const gated = new CreditsService(
          mockConfig,
          {} as unknown as StripeService,
          repo as never,
          ledgerRepo as never,
          accountsRepo as never,
          workspacesRepo as never,
          membersRepo as never,
          stripeEventsRepo as never,
          createMockRepository<CreditReservationEntity>() as never,
          {
            resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
          } as unknown as WorkspaceContextService,
          new PlanCatalogService(createMockRepository<PlanDefinitionEntity>() as never),
          undefined,
          undefined,
          undefined,
          budgetGate as unknown as BudgetGateChecker,
        )
        repo.findOne.mockResolvedValue({
          user_id: 'solo-1',
          plan: 'team',
          accounts_limit: 100,
          accounts_used: 35,
        } as SubscriptionEntity)
        const diag = await gated.enrichmentDiagnostic('solo-1')
        expect(diag).toMatchObject({
          cause: 'workspace_budget',
          workspaceGate: 'Le budget mensuel de cet espace est atteint.',
        })
      })

      // #2440.48 — le refus par QUOTA D'OUTIL se nomme `tool_daily_cap`, pas `workspace_budget` :
      // lever le budget mensuel ne rouvrirait pas un quota quotidien. Diagnostic seul (aucun débit).
      it("quota quotidien d'outil atteint : cause `tool_daily_cap`, distincte du budget d'espace", async () => {
        const budgetGate = jest.fn().mockResolvedValue({
          allowed: false,
          overCap: 'tool_daily_cap',
          message: "Le quota quotidien de l'enrichissement est atteint pour cet espace. Il se rouvre à minuit (UTC).",
        })
        const gated = new CreditsService(
          mockConfig,
          {} as unknown as StripeService,
          repo as never,
          ledgerRepo as never,
          accountsRepo as never,
          workspacesRepo as never,
          membersRepo as never,
          stripeEventsRepo as never,
          createMockRepository<CreditReservationEntity>() as never,
          {
            resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
          } as unknown as WorkspaceContextService,
          new PlanCatalogService(createMockRepository<PlanDefinitionEntity>() as never),
          undefined,
          undefined,
          undefined,
          budgetGate as unknown as BudgetGateChecker,
        )
        repo.findOne.mockResolvedValue({
          user_id: 'solo-1',
          plan: 'team',
          accounts_limit: 100,
          accounts_used: 35,
        } as SubscriptionEntity)
        const diag = await gated.enrichmentDiagnostic('solo-1')
        expect(diag.cause).toBe('tool_daily_cap')
        expect(diag.workspaceGate).toContain('quota quotidien')
        expect(ledgerRepo.insert).not.toHaveBeenCalled()
      })
    })

    it("solde réellement vide : pas de raison inventée (l'appelant garde « crédits épuisés »)", async () => {
      repo._qb.execute.mockResolvedValueOnce({ affected: 0 })
      repo.findOne.mockResolvedValueOnce({
        user_id: 'solo-1',
        plan: 'team',
        accounts_limit: 10,
        accounts_used: 10,
      } as SubscriptionEntity)
      const res = await service.consumeEnrichmentCredit('solo-1')
      expect(res).toEqual({ ok: false, remaining: 0 })
    })
  })

  /**
   * Épopée #2975 — `WorkspaceBudgetController` existait déjà (leviers + porte
   * pure `checkBudgetGate`) mais n'était appelé par AUCUNE action coûteuse
   * réelle. Ce bloc prouve le branchement au SEUL chokepoint qui débite —
   * `consumeAnalysisSlot`/`consumeEnrichmentCredit` — d'où passent TOUTES les
   * actions coûteuses (analyse, enrichissement, need_play, cv_rewrite…).
   */
  describe('porte de budget par espace (#2975) — checkGate AVANT le débit', () => {
    let budgetGate: jest.Mock
    let gatedService: CreditsService

    beforeEach(() => {
      budgetGate = jest.fn()
      const planCatalog = new PlanCatalogService(createMockRepository<PlanDefinitionEntity>() as never)
      gatedService = new CreditsService(
        mockConfig,
        {} as unknown as StripeService,
        repo as never,
        ledgerRepo as never,
        accountsRepo as never,
        workspacesRepo as never,
        membersRepo as never,
        stripeEventsRepo as never,
        createMockRepository<CreditReservationEntity>() as never,
        {
          resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
        } as unknown as WorkspaceContextService,
        planCatalog,
        undefined,
        undefined,
        undefined,
        budgetGate as unknown as BudgetGateChecker,
      )
    })

    it('refuse une analyse au-delà du budget d’espace, SANS débiter, avec la raison NOMMÉE', async () => {
      budgetGate.mockResolvedValueOnce({
        allowed: false,
        overCap: 'workspace_budget',
        message: 'Le budget mensuel de cet espace est atteint.',
      })
      repo.findOne.mockResolvedValueOnce({ accounts_used: 5, accounts_limit: 40 } as SubscriptionEntity)

      const res = await gatedService.consumeAnalysisSlot('solo-1', { scopeMode: 'france' })

      expect(res).toEqual({ ok: false, used: 5, limit: 40, reason: SOFT_BRAKE_MESSAGE }) // #4464 — la limite chiffrée ne part pas au client
      // Aucun débit : ni la mise à jour SQL, ni la ligne de registre.
      expect(repo._qb.execute).not.toHaveBeenCalled()
      expect(ledgerRepo.insert).not.toHaveBeenCalled()
    })

    it('laisse passer une analyse SOUS le budget d’espace — débite normalement', async () => {
      budgetGate.mockResolvedValueOnce({ allowed: true, overCap: null })
      repo._qb.execute.mockResolvedValueOnce({ affected: 1 })
      repo.findOne.mockResolvedValueOnce({ accounts_used: 9, accounts_limit: 40 } as SubscriptionEntity)

      const res = await gatedService.consumeAnalysisSlot('solo-1', { scopeMode: 'france' })

      expect(res.ok).toBe(true)
      // `scopeMode: 'france'` coûte 8 crédits (voir « cost grid » ci-dessus) ;
      // l'estimation transmise à la porte est 0,65 $/analyse × 8.
      expect(budgetGate).toHaveBeenCalledWith('ws-1', 'solo-1', 'analysis', 6.5)
      expect(ledgerRepo.insert).toHaveBeenCalledWith(expect.objectContaining({ kind: 'consume_analysis' }))
    })

    it('refuse un enrichissement au-delà du budget d’espace, SANS débiter, avec la raison NOMMÉE', async () => {
      budgetGate.mockResolvedValueOnce({
        allowed: false,
        overCap: 'action_cap',
        message: 'Le plafond réservé à cette action est atteint.',
      })
      repo.findOne.mockResolvedValueOnce({
        accounts_limit: 10,
        accounts_used: 4,
        topup_analyses: 0,
      } as SubscriptionEntity)

      const res = await gatedService.consumeEnrichmentCredit('solo-1', { type: 'contact' })

      expect(res).toEqual({ ok: false, remaining: 6, reason: SOFT_BRAKE_MESSAGE }) // #4464
      expect(repo._qb.execute).not.toHaveBeenCalled()
      expect(ledgerRepo.insert).not.toHaveBeenCalled()
    })

    it('laisse passer un enrichissement SOUS le budget d’espace — débite normalement', async () => {
      budgetGate.mockResolvedValueOnce({ allowed: true, overCap: null })
      repo._qb.execute.mockResolvedValueOnce({ affected: 1 })
      repo.findOne.mockResolvedValueOnce({
        accounts_limit: 10,
        accounts_used: 1,
        topup_analyses: 0,
      } as SubscriptionEntity)

      const res = await gatedService.consumeEnrichmentCredit('solo-1', { type: 'contact' })

      expect(res.ok).toBe(true)
      expect(budgetGate).toHaveBeenCalledWith('ws-1', 'solo-1', 'enrichment', 0.08)
      expect(ledgerRepo.insert).toHaveBeenCalledWith(expect.objectContaining({ kind: 'consume_enrichment' }))
    })
  })

  describe('credit_low notification (transparence billing — Théo beta 15/08)', () => {
    let notifications: { getPreferences: jest.Mock; countSince: jest.Mock; createNotification: jest.Mock }
    let notifyingService: CreditsService

    /** A subscription row AFTER the debit — team plan (quota enrich 100). */
    const rowAfterDebit = (over: Partial<SubscriptionEntity> = {}): SubscriptionEntity =>
      ({
        user_id: 'solo-1',
        plan: 'team',
        accounts_limit: 50,
        accounts_used: 10,
        enrichment_credits: 50,
        period_start: new Date('2026-07-01T00:00:00Z'),
        trial_end: null,
        ...over,
      }) as SubscriptionEntity

    beforeEach(() => {
      notifications = {
        getPreferences: jest.fn().mockResolvedValue({ credit_low: true }),
        countSince: jest.fn().mockResolvedValue(0),
        createNotification: jest.fn().mockResolvedValue(undefined),
      }
      notifyingService = new CreditsService(
        mockConfig,
        { listInvoices, createSubscriptionCheckout, createOneShotCheckout } as unknown as StripeService,
        repo as never,
        ledgerRepo as never,
        accountsRepo as never,
        workspacesRepo as never,
        membersRepo as never,
        stripeEventsRepo as never,
        createMockRepository<CreditReservationEntity>() as never,
        { resolveActiveWorkspace } as unknown as WorkspaceContextService,
        new PlanCatalogService(createMockRepository<PlanDefinitionEntity>() as never),
        undefined, // analytics
        undefined, // locks
        notifications as never,
      )
    })

    it('notifies the owner when an enrichment debit drops the balance under 20% of the plan quota', async () => {
      repo._qb.execute.mockResolvedValueOnce({ affected: 1 })
      // MONNAIE UNIQUE : la jauge est le pool du cycle. Plafond 100, 81 consommés
      // → 19 restants, sous le seuil de 20 %.
      // `mockResolvedValue` (et non `...Once`) : la valeur de ce test ne doit pas
      // dépendre d'un « once » laissé en file par un test précédent.
      repo.findOne.mockResolvedValue(rowAfterDebit({ accounts_limit: 100, accounts_used: 81 }))

      const res = await notifyingService.consumeEnrichmentCredit('solo-1')

      expect(res).toEqual({ ok: true, remaining: 19 })
      expect(notifications.createNotification).toHaveBeenCalledTimes(1)
      expect(notifications.createNotification).toHaveBeenCalledWith(
        'solo-1',
        expect.objectContaining({ type: 'credit_low', link: '/billing' }),
      )
      const arg = notifications.createNotification.mock.calls[0][1] as { body: string }
      expect(arg.body).toContain('19')
      expect(arg.body).toContain('100')
    })

    it('notifies when an analysis debit drops the remaining slots under 20% of the limit', async () => {
      repo._qb.execute.mockResolvedValueOnce({ affected: 1 })
      // limit 50 → threshold 10 → 9 remaining (41 used) is LOW.
      repo.findOne.mockResolvedValueOnce(rowAfterDebit({ accounts_used: 41 }))

      const res = await notifyingService.consumeAnalysisSlot('solo-1')

      expect(res.ok).toBe(true)
      expect(notifications.createNotification).toHaveBeenCalledWith(
        'solo-1',
        expect.objectContaining({ type: 'credit_low' }),
      )
      const arg = notifications.createNotification.mock.calls[0][1] as { body: string }
      expect(arg.body).toContain('9')
      expect(arg.body).toContain('50')
    })

    // D5 (Louis, 28/08) — la borne est INCLUSIVE : « à 79 % rien ne s'affiche,
    // à 80 % l'avertissement paraît ». L'ancienne écriture (`remaining >= quota
    // * 0.2` ⇒ silence) laissait passer le pile-poil 80 % sans rien dire.
    it("reste silencieux à 79 % consommé — l'annonce n'est pas encore due", async () => {
      repo._qb.execute.mockResolvedValueOnce({ affected: 1 })
      repo.findOne.mockResolvedValueOnce(rowAfterDebit({ accounts_limit: 100, accounts_used: 79 }))

      await notifyingService.consumeEnrichmentCredit('solo-1')

      expect(notifications.createNotification).not.toHaveBeenCalled()
    })

    it('parle EXACTEMENT à 80 % consommé (la borne est inclusive)', async () => {
      repo._qb.execute.mockResolvedValueOnce({ affected: 1 })
      repo.findOne.mockResolvedValueOnce(rowAfterDebit({ accounts_limit: 100, accounts_used: 80 }))

      await notifyingService.consumeEnrichmentCredit('solo-1')

      expect(notifications.createNotification).toHaveBeenCalledTimes(1)
    })

    it('stays silent well above the threshold', async () => {
      repo._qb.execute.mockResolvedValueOnce({ affected: 1 })
      // Pool largement au-dessus du seuil : 50 de plafond, 10 consommés.
      repo.findOne.mockResolvedValueOnce(rowAfterDebit({ accounts_limit: 50, accounts_used: 10 }))

      await notifyingService.consumeEnrichmentCredit('solo-1')

      expect(notifications.createNotification).not.toHaveBeenCalled()
    })

    it('anti-spam: at most ONE credit_low per quota cycle (anchored on period_start)', async () => {
      repo._qb.execute.mockResolvedValueOnce({ affected: 1 })
      const periodStart = new Date('2026-07-01T00:00:00Z')
      repo.findOne.mockResolvedValue(
        rowAfterDebit({ accounts_limit: 50, accounts_used: 45, period_start: periodStart }),
      )
      notifications.countSince.mockResolvedValueOnce(1) // one already sent this cycle

      const res = await notifyingService.consumeEnrichmentCredit('solo-1')

      expect(res.ok).toBe(true)
      expect(notifications.countSince).toHaveBeenCalledWith('solo-1', 'credit_low', periodStart)
      expect(notifications.createNotification).not.toHaveBeenCalled()
    })

    it('respects the pref opt-out (credit_low: false → no notification)', async () => {
      repo._qb.execute.mockResolvedValueOnce({ affected: 1 })
      repo.findOne.mockResolvedValueOnce(rowAfterDebit({ accounts_limit: 50, accounts_used: 45 }))
      notifications.getPreferences.mockResolvedValueOnce({ credit_low: false })

      await notifyingService.consumeEnrichmentCredit('solo-1')

      expect(notifications.createNotification).not.toHaveBeenCalled()
    })

    it('a notification failure never breaks the debit (best-effort)', async () => {
      repo._qb.execute.mockResolvedValueOnce({ affected: 1 })
      repo.findOne.mockResolvedValueOnce(rowAfterDebit({ accounts_limit: 50, accounts_used: 45 }))
      notifications.createNotification.mockRejectedValueOnce(new Error('db down'))

      const res = await notifyingService.consumeEnrichmentCredit('solo-1')

      expect(res).toEqual({ ok: true, remaining: 5 })
    })

    it('without the notifications wiring (direct-`new` specs) the debit is byte-identical', async () => {
      repo._qb.execute.mockResolvedValueOnce({ affected: 1 })
      repo.findOne.mockResolvedValueOnce(rowAfterDebit({ accounts_limit: 50, accounts_used: 45 }))

      // `service` from the outer beforeEach has NO notifications stub.
      const res = await service.consumeEnrichmentCredit('solo-1')

      expect(res).toEqual({ ok: true, remaining: 5 })
    })

    it('#2875/#2402.1 — persiste AUSSI un TriggerEvent canonique « credit_low », par espace possédé', async () => {
      const triggers = { recordOnceByDedupeKey: jest.fn().mockResolvedValue(undefined) }
      const withTriggers = new CreditsService(
        mockConfig,
        { listInvoices, createSubscriptionCheckout, createOneShotCheckout } as unknown as StripeService,
        repo as never,
        ledgerRepo as never,
        accountsRepo as never,
        workspacesRepo as never,
        membersRepo as never,
        stripeEventsRepo as never,
        createMockRepository<CreditReservationEntity>() as never,
        { resolveActiveWorkspace } as unknown as WorkspaceContextService,
        new PlanCatalogService(createMockRepository<PlanDefinitionEntity>() as never),
        undefined, // analytics
        undefined, // locks
        notifications as never,
        undefined, // budgetGate
        triggers as never,
      )
      repo._qb.execute.mockResolvedValueOnce({ affected: 1 })
      repo.findOne.mockResolvedValueOnce(rowAfterDebit({ accounts_limit: 100, accounts_used: 81 }))
      workspacesRepo.find.mockResolvedValueOnce([{ id: 'ws-solo-1', owner_user_id: 'solo-1', is_demo: false }])

      await withTriggers.consumeEnrichmentCredit('solo-1')

      expect(workspacesRepo.find).toHaveBeenCalledWith({ where: { owner_user_id: 'solo-1', is_demo: false } })
      expect(triggers.recordOnceByDedupeKey).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'credit_low',
          scope: { workspaceId: 'ws-solo-1', ownerId: 'solo-1' },
        }),
        'credits/credits.service',
      )
    })

    it('#2875/#2402.1 — n’inonde PAS le registre : rien de plus quand la notification ne serait pas envoyée (opt-out)', async () => {
      const triggers = { recordOnceByDedupeKey: jest.fn().mockResolvedValue(undefined) }
      const withTriggers = new CreditsService(
        mockConfig,
        { listInvoices, createSubscriptionCheckout, createOneShotCheckout } as unknown as StripeService,
        repo as never,
        ledgerRepo as never,
        accountsRepo as never,
        workspacesRepo as never,
        membersRepo as never,
        stripeEventsRepo as never,
        createMockRepository<CreditReservationEntity>() as never,
        { resolveActiveWorkspace } as unknown as WorkspaceContextService,
        new PlanCatalogService(createMockRepository<PlanDefinitionEntity>() as never),
        undefined, // analytics
        undefined, // locks
        notifications as never,
        undefined, // budgetGate
        triggers as never,
      )
      repo._qb.execute.mockResolvedValueOnce({ affected: 1 })
      repo.findOne.mockResolvedValueOnce(rowAfterDebit({ accounts_limit: 50, accounts_used: 45 }))
      notifications.getPreferences.mockResolvedValueOnce({ credit_low: false })

      await withTriggers.consumeEnrichmentCredit('solo-1')

      expect(triggers.recordOnceByDedupeKey).not.toHaveBeenCalled()
    })

    /**
     * D5 (Louis, 28/08) — « livrer l'annonce AVANT le mur ».
     *
     * Le seuil vit à UN SEUL endroit (GA-26) : la variable d'environnement
     * `CREDIT_LOW_THRESHOLD_PERCENT`, lue une fois au démarrage. Le web ne le
     * recalcule pas — il lit `credits_low` dans la réponse de `GET /credits`,
     * qui sort du MÊME calcul que la notification ci-dessus.
     */
    describe('le seuil est réglable, et il vit à un seul endroit', () => {
      const serviceWith = (config: ConfigService): CreditsService =>
        new CreditsService(
          config,
          { listInvoices, createSubscriptionCheckout, createOneShotCheckout } as unknown as StripeService,
          repo as never,
          ledgerRepo as never,
          accountsRepo as never,
          workspacesRepo as never,
          membersRepo as never,
          stripeEventsRepo as never,
          createMockRepository<CreditReservationEntity>() as never,
          { resolveActiveWorkspace } as unknown as WorkspaceContextService,
          new PlanCatalogService(createMockRepository<PlanDefinitionEntity>() as never),
          undefined,
          undefined,
          notifications as never,
        )

      it('un seuil à 50 % avance l’annonce — 60 % consommé la déclenche', async () => {
        repo._qb.execute.mockResolvedValueOnce({ affected: 1 })
        repo.findOne.mockResolvedValueOnce(rowAfterDebit({ accounts_limit: 100, accounts_used: 60 }))

        await serviceWith(configWithThreshold(50)).consumeEnrichmentCredit('solo-1')

        expect(notifications.createNotification).toHaveBeenCalledTimes(1)
      })

      it('une valeur illisible retombe sur 80 % — jamais une erreur au démarrage', async () => {
        repo._qb.execute.mockResolvedValueOnce({ affected: 1 })
        repo.findOne.mockResolvedValueOnce(rowAfterDebit({ accounts_limit: 100, accounts_used: 79 }))

        await serviceWith(configWithThreshold('pas un nombre')).consumeEnrichmentCredit('solo-1')

        expect(notifications.createNotification).not.toHaveBeenCalled()
      })

      it('le REPORT encore valide compte dans la capacité (il ne fait plus mentir le seuil)', async () => {
        // 100 de quota + 100 de report valide = 200 de capacité. 150 consommés
        // = 75 % : sous le seuil. L'ancien calcul ignorait le report côté
        // capacité tout en le comptant côté solde restant : il annonçait
        // « bientôt épuisé » à un client qui avait la moitié de sa réserve.
        repo._qb.execute.mockResolvedValueOnce({ affected: 1 })
        repo.findOne.mockResolvedValueOnce(
          rowAfterDebit({
            accounts_limit: 100,
            accounts_used: 150,
            rollover_credits: 100,
            rollover_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          }),
        )

        await notifyingService.consumeEnrichmentCredit('solo-1')

        expect(notifications.createNotification).not.toHaveBeenCalled()
      })
    })
  })

  /**
   * D5 — ce que l'ÉCRAN lit pour annoncer avant le mur. La décision est prise
   * côté serveur (`credits_low`) : deux chemins qui referaient le calcul
   * divergeraient, et c'est l'écran qui mentirait.
   */
  describe('getCredits — credits_low (D5)', () => {
    const row = (over: Partial<SubscriptionEntity>): SubscriptionEntity =>
      ({
        user_id: 'solo-1',
        plan: 'growth',
        accounts_limit: 100,
        accounts_used: 0,
        topup_analyses: 0,
        period_start: new Date('2026-08-01T00:00:00Z'),
        ...over,
      }) as SubscriptionEntity

    it('à 79 % consommé, rien à annoncer', async () => {
      repo.findOne.mockResolvedValueOnce(row({ accounts_used: 79 }))
      const res = await service.getCredits('solo-1')
      expect(res.credits_remaining).toBe(21)
      expect(res.credits_low).toBe(false)
    })

    it('à 80 % consommé, l’annonce est due', async () => {
      repo.findOne.mockResolvedValueOnce(row({ accounts_used: 80 }))
      const res = await service.getCredits('solo-1')
      expect(res.credits_remaining).toBe(20)
      expect(res.credits_low).toBe(true)
    })

    it('à zéro crédit, l’annonce est due ET le solde est nul — le mur se dit', async () => {
      repo.findOne.mockResolvedValueOnce(row({ accounts_used: 100 }))
      const res = await service.getCredits('solo-1')
      expect(res.credits_remaining).toBe(0)
      expect(res.credits_low).toBe(true)
    })

    it('une capacité inconnue (aucune ligne) n’annonce rien — « 0 » n’est pas « non mesuré »', async () => {
      repo.findOne.mockResolvedValueOnce(null)
      const res = await service.getCredits('solo-1')
      expect(res.credits_low).toBe(false)
    })

    it('une salle de démonstration n’annonce JAMAIS — elle n’a pas de facturation', async () => {
      workspacesRepo.findOne.mockResolvedValueOnce({
        id: 'ws-1',
        owner_user_id: 'solo-1',
        is_demo: true,
      } as WorkspaceEntity)
      repo.findOne.mockResolvedValueOnce(row({ accounts_used: 100 }))

      const res = await service.getCredits('solo-1')

      expect(res.is_demo).toBe(true)
      expect(res.credits_low).toBe(false)
      // Le silence est CLASSÉ, pas subi : la raison vit dans le registre de
      // couverture de la démonstration, et ce test la lit — une décision écrite
      // que personne ne relit redevient un oubli en trois semaines.
      expect(DEMO_BILLING_ANNOUNCEMENTS_INTENTIONALLY_SILENT.credits_low?.length ?? 0).toBeGreaterThan(80)
    })
  })

  describe('canAnalyze', () => {
    it('allows usage under the limit', () => {
      expect(service.canAnalyze(2, 3)).toBe(true)
    })

    it('denies usage at or over the limit', () => {
      expect(service.canAnalyze(3, 3)).toBe(false)
      expect(service.canAnalyze(5, 3)).toBe(false)
    })
  })

  describe('getCredits', () => {
    it('returns a locked no-access state when no row exists (row is always seeded at signup)', async () => {
      repo.findOne.mockResolvedValueOnce(null)
      const result = await service.getCredits('user-42')
      expect(result.user_id).toBe('user-42')
      expect(result.plan).toBe('trial')
      expect(result.accounts_limit).toBe(0)
    })

    it('returns the stored row when found', async () => {
      const row = {
        user_id: 'user-42',
        plan: 'team',
        accounts_limit: 30,
        enrichment_credits: 50,
        accounts_used: 5,
      } as SubscriptionEntity
      repo.findOne.mockResolvedValueOnce(row)
      const result = await service.getCredits('user-42')
      expect(result.plan).toBe('team')
      expect(result.accounts_limit).toBe(30)
    })

    it('reports the caller as billing owner with plan seat total + used seats (solo user)', async () => {
      const row = { user_id: 'user-42', plan: 'team', accounts_limit: 30 } as SubscriptionEntity
      repo.findOne.mockResolvedValueOnce(row)
      workspacesRepo.findOne.mockResolvedValueOnce({ id: 'ws-1', owner_user_id: 'user-42' } as WorkspaceEntity)
      membersRepo.count.mockResolvedValueOnce(1)
      const result = await service.getCredits('user-42')
      expect(result.is_billing_owner).toBe(true)
      expect(result.seats_total).toBe(3) // team includes 3 seats
      expect(result.seats_used).toBe(1)
    })

    it("a member sees the OWNER's plan, is not billing owner, and counts all seats", async () => {
      // Member calls; active workspace is owned by someone else.
      resolveActiveWorkspace.mockResolvedValueOnce({ workspaceId: 'ws-9', role: 'member' })
      workspacesRepo.findOne.mockResolvedValueOnce({ id: 'ws-9', owner_user_id: 'owner-1' } as WorkspaceEntity)
      // The subscription looked up is the OWNER's.
      repo.findOne.mockResolvedValueOnce({
        user_id: 'owner-1',
        plan: 'growth',
        accounts_limit: 120,
        enrichment_credits: 300,
        accounts_used: 7,
      } as SubscriptionEntity)
      membersRepo.count.mockResolvedValueOnce(4)

      const result = await service.getCredits('member-1')

      expect(repo.findOne).toHaveBeenCalledWith({ where: { user_id: 'owner-1' } })
      expect(result.plan).toBe('growth')
      expect(result.accounts_used).toBe(7)
      expect(result.is_billing_owner).toBe(false)
      expect(result.seats_total).toBe(1) // growth → 1 siège inclus depuis la grille du 16/08
      expect(result.seats_used).toBe(4)
    })

    it('exposes the per-tier included seats (starter 1 / growth 1 / team 3)', async () => {
      // Grille du 16/08 : un poste de travail par palier public, l'équipe
      // s'ajoute siège par siège. Team / Enterprise garde ses 3 sièges — il est
      // provisionné à la main.
      for (const [plan, seats] of [
        ['starter', 1],
        ['growth', 1],
        ['team', 3],
      ] as const) {
        repo.findOne.mockResolvedValueOnce({ user_id: 'u', plan } as SubscriptionEntity)
        workspacesRepo.findOne.mockResolvedValueOnce({ id: 'ws', owner_user_id: 'u' } as WorkspaceEntity)
        membersRepo.count.mockResolvedValueOnce(1)
        const result = await service.getCredits('u')
        expect(result.seats_total).toBe(seats)
      }
    })

    it('resolves a LEGACY not-yet-migrated plan row (pro) to its renamed tier seats', async () => {
      repo.findOne.mockResolvedValueOnce({ user_id: 'u', plan: 'pro' } as SubscriptionEntity)
      workspacesRepo.findOne.mockResolvedValueOnce({ id: 'ws', owner_user_id: 'u' } as WorkspaceEntity)
      membersRepo.count.mockResolvedValueOnce(1)
      const result = await service.getCredits('u')
      expect(result.seats_total).toBe(3) // pro → team → 3 seats (not the trial fallback)
    })

    it('adds purchased extra seats to the plan total', async () => {
      const row = { user_id: 'u', plan: 'team', accounts_limit: 40, extra_seats: 2 } as SubscriptionEntity
      repo.findOne.mockResolvedValueOnce(row)
      workspacesRepo.findOne.mockResolvedValueOnce({ id: 'ws', owner_user_id: 'u' } as WorkspaceEntity)
      membersRepo.count.mockResolvedValueOnce(1)
      const result = await service.getCredits('u')
      expect(result.extra_seats).toBe(2)
      expect(result.seats_total).toBe(5) // 3 included + 2 extra
    })
  })

  describe('workspace-shared quota (owner resolution)', () => {
    it("a member's analysis slot is claimed against the OWNER's subscription", async () => {
      resolveActiveWorkspace.mockResolvedValueOnce({ workspaceId: 'ws-9', role: 'member' })
      workspacesRepo.findOne.mockResolvedValueOnce({ id: 'ws-9', owner_user_id: 'owner-1' } as WorkspaceEntity)
      repo._qb.execute.mockResolvedValueOnce({ affected: 1 })
      repo.findOne.mockResolvedValueOnce({ accounts_used: 8, accounts_limit: 30 } as SubscriptionEntity)

      const res = await service.consumeAnalysisSlot('member-1')

      expect(res).toEqual({ ok: true, used: 8, limit: 30, ledgerId: null })
      // The guarded UPDATE targets the owner's row, not the member's.
      expect(repo._qb.where).toHaveBeenCalledWith(expect.any(String), { userId: 'owner-1' })
    })

    /**
     * Composition of two changes that landed together and never touch the same
     * line: #641 made the analysis cap `accounts_limit + topup_analyses` (so a
     * one-off pack is spendable but cleared by the monthly reset), and the
     * workspace switcher made {@link CreditsService} resolve the billing subject
     * from the caller's ACTIVE workspace.
     *
     * They compose on two different axes — the switcher picks WHICH row, the
     * top-up decides WHICH COLUMNS cap it — so the crossing case falls out of
     * neither suite and is asserted here: a user who belongs to two workspaces
     * must spend the ACTIVE workspace owner's quota including that owner's
     * top-up, and must never reach the other owner's top-up.
     */
    it('spends the ACTIVE workspace owner top-up, never the other workspace one', async () => {
      // Active in the ESN (owner-esn) — the pack owner-esn bought is in play.
      resolveActiveWorkspace.mockResolvedValueOnce({ workspaceId: 'ws-esn', role: 'sales' })
      workspacesRepo.findOne.mockResolvedValueOnce({ id: 'ws-esn', owner_user_id: 'owner-esn' } as WorkspaceEntity)
      repo._qb.execute.mockResolvedValueOnce({ affected: 1 })
      repo.findOne.mockResolvedValueOnce({ accounts_used: 41, accounts_limit: 30 } as SubscriptionEntity)

      await service.consumeAnalysisSlot('joiner-1')

      const [esnSql, esnParams] = repo._qb.where.mock.calls.at(-1) as [string, { userId: string }]
      // The row debited is the ESN owner's…
      expect(esnParams).toEqual({ userId: 'owner-esn' })
      // …and the cap still separates plan quota from purchased capacity (#641),
      // so the ESN's top-up is spendable here and nowhere else.
      expect(esnSql).toContain('accounts_limit + topup_analyses')

      // Same person switches back to their own personal workspace.
      resolveActiveWorkspace.mockResolvedValueOnce({ workspaceId: 'ws-perso', role: 'owner' })
      workspacesRepo.findOne.mockResolvedValueOnce({ id: 'ws-perso', owner_user_id: 'joiner-1' } as WorkspaceEntity)
      repo._qb.execute.mockResolvedValueOnce({ affected: 1 })
      repo.findOne.mockResolvedValueOnce({ accounts_used: 2, accounts_limit: 3 } as SubscriptionEntity)

      await service.consumeAnalysisSlot('joiner-1')

      const [persoSql, persoParams] = repo._qb.where.mock.calls.at(-1) as [string, { userId: string }]
      // Now their OWN row is debited — the ESN's top-up is out of reach.
      expect(persoParams).toEqual({ userId: 'joiner-1' })
      expect(persoSql).toContain('accounts_limit + topup_analyses')
    })

    it("a member's enrichment credit is consumed from the OWNER's balance", async () => {
      resolveActiveWorkspace.mockResolvedValueOnce({ workspaceId: 'ws-9', role: 'member' })
      workspacesRepo.findOne.mockResolvedValueOnce({ id: 'ws-9', owner_user_id: 'owner-1' } as WorkspaceEntity)
      repo._qb.execute.mockResolvedValueOnce({ affected: 1 })
      repo.findOne.mockResolvedValueOnce({ accounts_limit: 20, accounts_used: 8 } as SubscriptionEntity)

      const res = await service.consumeEnrichmentCredit('member-1')

      expect(res).toEqual({ ok: true, remaining: 12 })
      expect(repo._qb.where).toHaveBeenCalledWith(expect.any(String), { userId: 'owner-1' })
    })

    it('solo user resolves to themself — the slot is claimed against their own row', async () => {
      // Default beforeEach: workspaces.findOne → null → ownerUserId === caller.
      repo._qb.execute.mockResolvedValueOnce({ affected: 1 })
      repo.findOne.mockResolvedValueOnce({ accounts_used: 2, accounts_limit: 3 } as SubscriptionEntity)

      const res = await service.consumeAnalysisSlot('solo-1')

      expect(res).toEqual({ ok: true, used: 2, limit: 3, ledgerId: null })
      expect(repo._qb.where).toHaveBeenCalledWith(expect.any(String), { userId: 'solo-1' })
    })
  })

  describe('top-up (Théo §14 — recharge one-shot, config-gated)', () => {
    const PACK = {
      id: 'analysis_10',
      label: '+10 analyses',
      resource: 'analysis',
      amount: 10,
      priceCents: 900,
    } as const

    it('exposes a configured catalog with well-formed packs', () => {
      const packs = service.getTopupPacks()
      expect(packs.length).toBeGreaterThan(0)
      for (const p of packs) {
        expect(p.id).toBeTruthy()
        expect(p.label).toBeTruthy()
        expect(['analysis', 'enrichment']).toContain(p.resource)
        expect(p.amount).toBeGreaterThan(0)
        expect(p.priceCents).toBeGreaterThan(0)
      }
    })

    it('prices are DEGRESSIVE per resource (bigger pack → cheaper per unit)', () => {
      const packs = service.getTopupPacks()
      for (const resource of ['analysis', 'enrichment'] as const) {
        const perUnit = packs
          .filter(p => p.resource === resource)
          .sort((a, b) => a.amount - b.amount)
          .map(p => p.priceCents / p.amount)
        for (let i = 1; i < perUnit.length; i++) {
          expect(perUnit[i]).toBeLessThan(perUnit[i - 1])
        }
      }
    })

    it('pack ids are unique (Stripe metadata is keyed on them)', () => {
      const ids = service.getTopupPacks().map(p => p.id)
      expect(new Set(ids).size).toBe(ids.length)
    })

    it('createTopupCheckout returns { url: null } for an unknown/disabled pack — no Stripe call', async () => {
      const res = await service.createTopupCheckout('user-1', 'a@b.co', 'nope')
      expect(res).toEqual({ url: null })
      expect(createOneShotCheckout).not.toHaveBeenCalled()
    })

    it('createTopupCheckout uses the SERVER price + stamps owner/actor metadata', async () => {
      jest
        .spyOn(service as unknown as { resolveTopupPack(id: string): unknown }, 'resolveTopupPack')
        .mockReturnValue(PACK)
      workspacesRepo.findOne.mockResolvedValueOnce({ id: 'ws-1', owner_user_id: 'owner-1' } as WorkspaceEntity)

      const res = await service.createTopupCheckout('member-1', 'm@b.co', 'analysis_10')

      expect(res).toEqual({ url: 'https://checkout.stripe.test/topup' })
      const arg = createOneShotCheckout.mock.calls[0][0]
      expect(arg.unitAmount).toBe(900) // server price, not client-supplied
      expect(arg.metadata).toEqual({ userId: 'owner-1', topupPackId: 'analysis_10', topupActor: 'member-1' })
    })

    it('webhook grants an analysis pack: bumps accounts_limit + writes a topup ledger entry', async () => {
      jest
        .spyOn(service as unknown as { resolveTopupPack(id: string): unknown }, 'resolveTopupPack')
        .mockReturnValue(PACK)
      const event = {
        id: 'evt_topup',
        type: 'checkout.session.completed',
        data: {
          object: {
            payment_status: 'paid',
            metadata: { userId: 'owner-1', topupPackId: 'analysis_10', topupActor: 'member-1' },
          },
        },
      } as never

      await service.handleWebhookEvent(event)

      // The grant UPDATE ran and no plan branch fired (repo.save untouched).
      expect(repo._qb.execute).toHaveBeenCalled()
      expect(repo.save).not.toHaveBeenCalled()
      expect(ledgerRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          owner_user_id: 'owner-1',
          actor_user_id: 'member-1',
          kind: 'topup',
          resource: 'analysis_slot',
          delta: 10,
        }),
      )
    })

    it('webhook ignores a top-up for an unknown pack (no grant, no throw)', async () => {
      const event = {
        id: 'evt_bad',
        type: 'checkout.session.completed',
        data: { object: { payment_status: 'paid', metadata: { userId: 'owner-1', topupPackId: 'ghost' } } },
      } as never
      await expect(service.handleWebhookEvent(event)).resolves.toBeUndefined()
      expect(ledgerRepo.insert).not.toHaveBeenCalled()
    })
  })

  // A top-up is SOLD as one-off ("Ajoutez des crédits ponctuels sans changer
  // d'abonnement") and the CGV say a one-off top-up expires at the end of the
  // period it was bought for — the 30-day rollover they grant since 30/08 (D252)
  // covers the PLAN quota only, never a top-up, exactly as `resetElapsedMonthlyQuotas`
  // computes it. It must therefore grant capacity for the CURRENT cycle only. Granting it on
  // `accounts_limit` made it permanent: the monthly reset only zeroes
  // `accounts_used`, so every later cycle refilled against the inflated cap and
  // a single 119 € payment raised the monthly quota forever.
  describe('one-off top-up must NOT survive the monthly reset (revenue leak)', () => {
    const PACK = {
      id: 'analysis_50',
      label: '+50 analyses',
      resource: 'analysis',
      amount: 50,
      priceCents: 11900,
    } as const

    async function grantAnalysisTopup(): Promise<void> {
      jest
        .spyOn(service as unknown as { resolveTopupPack(id: string): unknown }, 'resolveTopupPack')
        .mockReturnValue(PACK)
      await service.handleWebhookEvent({
        id: 'evt_topup',
        type: 'checkout.session.completed',
        data: { object: { payment_status: 'paid', metadata: { userId: 'owner-1', topupPackId: 'analysis_50' } } },
      } as never)
    }

    it('grants the pack on the one-off counter, never on the plan cap', async () => {
      await grantAnalysisTopup()

      const set = repo._qb.set.mock.calls.at(-1)?.[0] as Record<string, () => string>
      expect(Object.keys(set)).toEqual(['topup_analyses'])
      expect(set.topup_analyses()).toBe('topup_analyses + 50')
      // The plan cap is the plan's business, and a one-off purchase never edits it.
      expect(set.accounts_limit).toBeUndefined()
    })

    it('the monthly reset clears the purchased extra (it does not roll into next month)', async () => {
      repo._qb.execute.mockResolvedValue({ affected: 0 })

      await service.resetElapsedMonthlyQuotas()

      const sets = repo._qb.set.mock.calls.map(call => call[0] as Record<string, unknown>)
      expect(sets).toHaveLength(4) // starter / team / growth / beta
      for (const set of sets) {
        expect(set.accounts_used).toBe(0)
        // The whole point: unused one-off capacity expires with the cycle.
        expect(set.topup_analyses).toBe(0)
      }
    })

    it('the debit guard spends the plan cap AND the purchased extra', async () => {
      repo._qb.execute.mockResolvedValue({ affected: 1 })
      repo.findOne.mockResolvedValue({ accounts_used: 1, accounts_limit: 15, topup_analyses: 50 } as never)

      await service.consumeAnalysisSlot('user-1')

      const where = repo._qb.where.mock.calls.at(-1)?.[0] as string
      expect(where).toContain('accounts_limit + topup_analyses')
    })

    it('reports the EFFECTIVE capacity so a buyer sees the analyses they paid for', async () => {
      repo.findOne.mockResolvedValue({
        user_id: 'owner-1',
        plan: 'team',
        accounts_limit: 50,
        accounts_used: 0,
        topup_analyses: 50,
        enrichment_credits: 100,
      } as never)
      membersRepo.count.mockResolvedValue(1)

      const status = await service.getCredits('owner-1')

      expect(status.accounts_limit).toBe(100) // 50 plan + 50 purchased
      expect(status.topup_analyses).toBe(50) // …and the breakdown stays legible
    })

    // The end-to-end statement of the defect, as arithmetic rather than SQL:
    // buy a pack, burn some of it, roll the month → capacity is back to the plan.
    it('a paid pack raises capacity for ONE cycle only', async () => {
      const row = { accounts_limit: 50, accounts_used: 0, topup_analyses: 0 }
      const capacity = () => row.accounts_limit + row.topup_analyses

      await grantAnalysisTopup()
      const grant = repo._qb.set.mock.calls.at(-1)?.[0] as Record<string, () => string>
      expect(grant.topup_analyses()).toBe('topup_analyses + 50')
      row.topup_analyses += 50
      expect(capacity()).toBe(100) // this cycle: plan + pack

      repo._qb.set.mockClear()
      repo._qb.execute.mockResolvedValue({ affected: 0 })
      await service.resetElapsedMonthlyQuotas()
      const reset = repo._qb.set.mock.calls[0]?.[0] as Record<string, unknown>
      row.accounts_used = reset.accounts_used as number
      row.topup_analyses = reset.topup_analyses as number

      expect(capacity()).toBe(50) // next cycle: the plan, and only the plan
      expect(row.accounts_limit).toBe(50) // the cap itself was never inflated
    })
  })

  describe('handleWebhookEvent', () => {
    it('upserts on checkout.session.completed', async () => {
      const event = {
        type: 'checkout.session.completed',
        data: { object: { metadata: { userId: 'user-1', plan: 'team' }, customer: 'cus_1', subscription: 'sub_1' } },
      } as never
      repo.findOne.mockResolvedValueOnce(null)
      await expect(service.handleWebhookEvent(event)).resolves.toBeUndefined()
      expect(repo.save).toHaveBeenCalled()
    })

    it('maps LEGACY Stripe metadata (plan "pro") onto the renamed tier (team quotas)', async () => {
      const event = {
        id: 'evt_legacy',
        type: 'checkout.session.completed',
        data: { object: { metadata: { userId: 'user-1', plan: 'pro' }, customer: 'cus_1', subscription: 'sub_1' } },
      } as never
      repo.findOne.mockResolvedValueOnce(null)
      await service.handleWebhookEvent(event)
      expect(repo.save).toHaveBeenCalledWith(
        // MONNAIE UNIQUE : team = 150 crédits (50 analyses + 100 enrichissements
        // d'avant la fusion), et plus de seconde monnaie.
        expect.objectContaining({ plan: 'team', accounts_limit: 600, enrichment_credits: 0 }),
      )
    })

    it('skips a redelivered event (idempotency) so it is not processed twice', async () => {
      const event = {
        id: 'evt_seen',
        type: 'checkout.session.completed',
        data: { object: { metadata: { userId: 'user-1', plan: 'team' }, customer: 'cus_1', subscription: 'sub_1' } },
      } as never
      // L'event est DÉJÀ gravé (traité une première fois) → on saute (finding #14).
      stripeEventsRepo.findOne.mockResolvedValueOnce({ id: 'evt_seen' } as never)
      await expect(service.handleWebhookEvent(event)).resolves.toBeUndefined()
      expect(repo.findOne).not.toHaveBeenCalled()
      expect(repo.save).not.toHaveBeenCalled()
    })

    it('SÉCURITÉ #14 — ne grave l’event qu’APRÈS le traitement (un throw laisse Stripe rejouer)', async () => {
      const event = {
        id: 'evt_topup_fail',
        type: 'checkout.session.completed',
        data: { object: { payment_status: 'paid', metadata: { userId: 'owner-1', topupPackId: 'analysis_10' } } },
      } as never
      jest
        .spyOn(service as unknown as { resolveTopupPack(id: string): unknown }, 'resolveTopupPack')
        .mockReturnValue({ id: 'analysis_10', amount: 10, resource: 'analysis' })
      // Pas encore gravé, mais l'incrément échoue.
      stripeEventsRepo.findOne.mockResolvedValueOnce(null)
      ledgerRepo._qb.getCount.mockResolvedValueOnce(0)
      repo._qb.execute.mockRejectedValueOnce(new Error('db down'))

      await expect(service.handleWebhookEvent(event)).rejects.toThrow('db down')
      // L'event n'a PAS été gravé → Stripe rejouera.
      expect(stripeEventsRepo._qb.insert).not.toHaveBeenCalled()
    })

    it('SÉCURITÉ #14 — un rejeu de top-up déjà crédité ne re-crédite pas', async () => {
      const event = {
        id: 'evt_topup_replay',
        type: 'checkout.session.completed',
        data: { object: { payment_status: 'paid', metadata: { userId: 'owner-1', topupPackId: 'analysis_10' } } },
      } as never
      jest
        .spyOn(service as unknown as { resolveTopupPack(id: string): unknown }, 'resolveTopupPack')
        .mockReturnValue({ id: 'analysis_10', amount: 10, resource: 'analysis' })
      stripeEventsRepo.findOne.mockResolvedValueOnce(null)
      // Le ledger porte DÉJÀ la recharge de cet event → on ne re-crédite pas.
      ledgerRepo._qb.getCount.mockResolvedValueOnce(1)

      await service.handleWebhookEvent(event)
      expect(ledgerRepo.insert).not.toHaveBeenCalled()
    })

    /**
     * Stripe fires `subscription.updated` for ANY change to the object — an
     * operator's price edit included. Re-granting quotas on a same-tier update
     * would hand the subscriber a fresh credit pool mid-cycle, every time.
     */
    it('leaves quotas alone when subscription.updated carries the SAME tier', async () => {
      repo.findOne.mockResolvedValueOnce({ user_id: 'user-1', plan: 'team' } as never)
      const event = {
        id: 'evt_same_tier',
        type: 'customer.subscription.updated',
        data: { object: { id: 'sub_1', metadata: { plan: 'team' } } },
      } as never

      await service.handleWebhookEvent(event)

      expect(repo._qb.execute).not.toHaveBeenCalled()
      expect(ledgerRepo.insert).not.toHaveBeenCalled()
    })

    it('applies the new quotas when subscription.updated carries a DIFFERENT tier', async () => {
      repo.findOne.mockResolvedValueOnce({ user_id: 'user-1', plan: 'starter' } as never)
      const event = {
        id: 'evt_tier_change',
        type: 'customer.subscription.updated',
        data: { object: { id: 'sub_1', metadata: { plan: 'team' } } },
      } as never

      await service.handleWebhookEvent(event)

      expect(repo._qb.execute).toHaveBeenCalled()
      expect(ledgerRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({ owner_user_id: 'user-1', kind: 'grant_plan' }),
      )
    })

    it('downgrades on customer.subscription.deleted', async () => {
      const event = {
        type: 'customer.subscription.deleted',
        data: { object: { id: 'sub_123', status: 'canceled' } },
      } as never
      await expect(service.handleWebhookEvent(event)).resolves.toBeUndefined()
      expect(repo._qb.execute).toHaveBeenCalled()
    })

    it('ignores unknown event types', async () => {
      const event = { type: 'unknown.event', data: { object: {} } } as never
      await expect(service.handleWebhookEvent(event)).resolves.toBeUndefined()
    })
  })

  describe('resetElapsedMonthlyQuotas (monthly reset)', () => {
    it('runs one reset per paid plan (starter/team/growth/beta) and sums the affected rows', async () => {
      repo._qb.execute
        .mockResolvedValueOnce({ affected: 2 }) // starter
        .mockResolvedValueOnce({ affected: 1 }) // team
        .mockResolvedValueOnce({ affected: 0 }) // growth
        .mockResolvedValueOnce({ affected: 3 }) // beta (reserved paid plan resets too)
      const n = await service.resetElapsedMonthlyQuotas()
      expect(n).toBe(6)
      expect(repo._qb.execute).toHaveBeenCalledTimes(4)
    })

    it('the cron swallows errors so a failed sweep never crashes the scheduler', async () => {
      repo._qb.execute.mockRejectedValueOnce(new Error('db down'))
      await expect(service.monthlyQuotaResetCron()).resolves.toBeUndefined()
    })

    it('the cron runs under the "monthly-quota-reset" singleton lock when wired (multi-replica)', async () => {
      const locks = { withLock: jest.fn((_name: string, fn: () => Promise<void>) => fn().then(() => true)) }
      const locked = new CreditsService(
        mockConfig,
        { listInvoices: jest.fn() } as unknown as StripeService,
        repo as never,
        ledgerRepo as never,
        accountsRepo as never,
        workspacesRepo as never,
        membersRepo as never,
        stripeEventsRepo as never,
        createMockRepository<CreditReservationEntity>() as never,
        { resolveActiveWorkspace: jest.fn() } as unknown as WorkspaceContextService,
        new PlanCatalogService(createMockRepository<PlanDefinitionEntity>() as never),
        undefined,
        locks as never,
      )
      repo._qb.execute.mockResolvedValue({ affected: 0, raw: [] })

      await locked.monthlyQuotaResetCron()

      expect(locks.withLock).toHaveBeenCalledWith('monthly-quota-reset', expect.any(Function))
      expect(repo._qb.execute).toHaveBeenCalledTimes(4) // the sweep ran inside the lock
    })

    it('the cron does NOTHING when another replica holds the tick lock', async () => {
      const locks = { withLock: jest.fn().mockResolvedValue(false) } // denied: fn never invoked
      const locked = new CreditsService(
        mockConfig,
        { listInvoices: jest.fn() } as unknown as StripeService,
        repo as never,
        ledgerRepo as never,
        accountsRepo as never,
        workspacesRepo as never,
        membersRepo as never,
        stripeEventsRepo as never,
        createMockRepository<CreditReservationEntity>() as never,
        { resolveActiveWorkspace: jest.fn() } as unknown as WorkspaceContextService,
        new PlanCatalogService(createMockRepository<PlanDefinitionEntity>() as never),
        undefined,
        locks as never,
      )

      await locked.monthlyQuotaResetCron()

      expect(repo._qb.execute).not.toHaveBeenCalled()
    })

    it('writes a grant_plan ledger line per reset owner (monthly refill is auditable)', async () => {
      repo._qb.execute
        .mockResolvedValueOnce({ affected: 1, raw: [{ user_id: 'owner-a' }] }) // starter
        .mockResolvedValueOnce({ affected: 0, raw: [] }) // team
        .mockResolvedValueOnce({ affected: 0, raw: [] }) // growth
        .mockResolvedValueOnce({ affected: 0, raw: [] }) // beta
      await service.resetElapsedMonthlyQuotas()
      expect(ledgerRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          owner_user_id: 'owner-a',
          kind: 'grant_plan',
          // `analysis_slot` = le nom historique de la ressource « crédit » dans le
          // ledger (renommer une valeur contrainte casserait l'historique).
          resource: 'analysis_slot',
          delta: 80, // quota de crédits starter (10 analyses à 8 crédits)
          reason: 'monthly_reset:starter',
        }),
      )
    })

    it('writes no ledger line when the DB returns no rows (RETURNING unsupported / nothing reset)', async () => {
      repo._qb.execute.mockResolvedValue({ affected: 0 }) // no `raw` → nothing to audit
      await service.resetElapsedMonthlyQuotas()
      expect(ledgerRepo.insert).not.toHaveBeenCalled()
    })

    it('rend le quota de CRÉDITS du palier, sans rétrograder un geste opérateur', async () => {
      repo._qb.execute.mockResolvedValue({ affected: 0 })
      await service.resetElapsedMonthlyQuotas()
      const grants = repo._qb.set.mock.calls.map(call => (call[0] as { accounts_limit: () => string }).accounts_limit())
      // `GREATEST` : un opérateur qui a accordé plus que le nominal (geste
      // commercial) ne voit pas son client rétrogradé au renouvellement.
      expect(grants).toEqual([
        'GREATEST(accounts_limit, 80)', // starter
        'GREATEST(accounts_limit, 600)', // team / enterprise
        'GREATEST(accounts_limit, 250)', // growth
        'GREATEST(accounts_limit, 600)', // bêta design partner
      ])
    })
  })

  describe('trial expiry (pricing v2)', () => {
    it('isTrialExpired is true only for a trial past its window', () => {
      const past = new Date(Date.now() - 1000).toISOString()
      const future = new Date(Date.now() + 60_000).toISOString()
      expect(isTrialExpired({ plan: 'trial', trial_end: past })).toBe(true)
      expect(isTrialExpired({ plan: 'trial', trial_end: future })).toBe(false)
      expect(isTrialExpired({ plan: 'trial', trial_end: null })).toBe(false)
      expect(isTrialExpired({ plan: 'team', trial_end: past })).toBe(false) // paid plans never expire
      expect(isTrialExpired(null)).toBe(false)
    })

    it('verrouille aussi un compte Découverte passé sa fenêtre (sinon : essai infini)', () => {
      const past = new Date(Date.now() - 1000).toISOString()
      const future = new Date(Date.now() + 60_000).toISOString()
      expect(isTrialExpired({ plan: 'decouverte', trial_end: past })).toBe(true)
      expect(isTrialExpired({ plan: 'decouverte', trial_end: future })).toBe(false)
      expect(isTrialExpired({ plan: 'decouverte', trial_end: null })).toBe(false)
    })

    it('le garde SQL de consommation couvre les DEUX paliers à fenêtre', async () => {
      repo._qb.execute.mockResolvedValueOnce({ affected: 1 })
      repo.findOne.mockResolvedValueOnce({ user_id: 'u', accounts_used: 1, accounts_limit: 1 })
      await service.consumeAnalysisSlot('u')
      const where = repo._qb.where.mock.calls[0][0] as string
      expect(where).toContain("plan NOT IN ('trial', 'decouverte')")
    })

    it('getCredits surfaces trial_expired + trial_end for an expired trial', async () => {
      const past = new Date(Date.now() - 1000)
      repo.findOne.mockResolvedValueOnce({
        user_id: 'u',
        plan: 'trial',
        accounts_limit: 40,
        accounts_used: 3,
        trial_end: past,
      } as SubscriptionEntity)
      const result = await service.getCredits('u')
      expect(result.trial_expired).toBe(true)
      expect(result.trial_end).toBe(past.toISOString())
    })

    it('getCredits reports an active trial as not expired', async () => {
      const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
      repo.findOne.mockResolvedValueOnce({
        user_id: 'u',
        plan: 'trial',
        accounts_limit: 40,
        accounts_used: 0,
        trial_end: future,
      } as SubscriptionEntity)
      const result = await service.getCredits('u')
      expect(result.trial_expired).toBe(false)
      expect(result.trial_end).toBe(future.toISOString())
    })
  })

  describe('consumeAnalysisSlot', () => {
    it('claims a slot and returns ok when under the plan limit', async () => {
      // Guarded UPDATE incremented one row (affected: 1).
      repo._qb.execute.mockResolvedValueOnce({ affected: 1 })
      repo.findOne.mockResolvedValueOnce({ accounts_used: 2, accounts_limit: 3 } as SubscriptionEntity)
      const res = await service.consumeAnalysisSlot('user-1')
      expect(res).toEqual({ ok: true, used: 2, limit: 3, ledgerId: null })
      expect(repo._qb.execute).toHaveBeenCalled()
    })

    it('returns ok:false when the plan cap is already reached', async () => {
      // Guarded UPDATE matched no row (accounts_used already == accounts_limit).
      repo._qb.execute.mockResolvedValueOnce({ affected: 0 })
      repo.findOne.mockResolvedValueOnce({ accounts_used: 3, accounts_limit: 3 } as SubscriptionEntity)
      const res = await service.consumeAnalysisSlot('user-1')
      expect(res.ok).toBe(false)
      expect(res.used).toBe(3)
      expect(res.limit).toBe(3)
    })

    it('sème une ligne à ZÉRO crédit quand l’utilisateur n’en a pas — et refuse l’analyse', async () => {
      // C'était la DERNIÈRE porte gratuite, et la plus discrète : la ligne
      // manquante était semée avec 48 crédits ET l'analyse passait (`ok: true`).
      // Retirer le trigger de signup sans fermer celle-ci aurait simplement
      // déplacé l'essai gratuit dans le chemin de consommation.
      repo._qb.execute.mockResolvedValueOnce({ affected: 0 })
      repo.findOne.mockResolvedValueOnce(null)
      const res = await service.consumeAnalysisSlot('new-user')

      expect(res).toEqual({ ok: false, used: 0, limit: 0 })
      // La ligne est bien POSÉE — la facturation a besoin d'un sujet, et
      // l'écran doit pouvoir nommer un palier — mais elle n'ouvre rien.
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'new-user',
          accounts_used: 0,
          plan: 'decouverte',
          accounts_limit: 0,
          enrichment_credits: 0,
        }),
      )
      expect(ledgerRepo.insert).not.toHaveBeenCalled()
    })
  })

  describe('nextResetFor — quand le quota repart à zéro', () => {
    it('rend period_start + 1 mois pour un plan payant', () => {
      expect(nextResetFor({ plan: 'team', period_start: '2026-07-03T00:00:00.000Z' })).toBe(
        new Date('2026-08-03T00:00:00.000Z').toISOString(),
      )
    })

    it('ne promet aucun renouvellement sur un palier à fenêtre — ceux-là EXPIRENT', () => {
      expect(nextResetFor({ plan: 'trial', period_start: '2026-07-03T00:00:00.000Z' })).toBeNull()
      expect(nextResetFor({ plan: 'decouverte', period_start: '2026-07-03T00:00:00.000Z' })).toBeNull()
    })

    it("n'invente pas de date quand la ligne n'en porte pas", () => {
      expect(nextResetFor({ plan: 'team', period_start: null })).toBeNull()
      expect(nextResetFor(null)).toBeNull()
    })
  })

  describe('refundAnalysisSlot', () => {
    it('decrements accounts_used via a guarded update', async () => {
      repo._qb.execute.mockResolvedValueOnce({ affected: 1 })
      await service.refundAnalysisSlot('user-1')
      expect(repo._qb.execute).toHaveBeenCalled()
    })
  })

  describe('refundEnrichmentCredit (ledger hardening — ready for debit-before-result providers)', () => {
    it('adds a credit back and writes a refund_enrichment ledger line (delta +1)', async () => {
      repo._qb.execute.mockResolvedValueOnce({ affected: 1 })
      await service.refundEnrichmentCredit('solo-1', { reason: 'apollo timeout', accountId: 'acc-9' })
      // Le remboursement rend un crédit au pool unique — il ne recrédite plus une
      // seconde monnaie. `GREATEST(...,0)` interdit un compteur négatif.
      const setArg = repo._qb.set.mock.calls[0][0] as { accounts_used: () => string }
      expect(setArg.accounts_used()).toBe('GREATEST(accounts_used - 1, 0)')
      expect(ledgerRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'refund_enrichment',
          resource: 'enrichment_credit',
          delta: 1,
          account_id: 'acc-9',
        }),
      )
    })

    it('refunds N credits when given an explicit cost', async () => {
      repo._qb.execute.mockResolvedValueOnce({ affected: 1 })
      await service.refundEnrichmentCredit('solo-1', { cost: 4 })
      const setArg = repo._qb.set.mock.calls[0][0] as { accounts_used: () => string }
      expect(setArg.accounts_used()).toBe('GREATEST(accounts_used - 4, 0)')
      expect(ledgerRepo.insert).toHaveBeenCalledWith(expect.objectContaining({ kind: 'refund_enrichment', delta: 4 }))
    })

    it('does NOT write a ledger line when no row was touched (affected: 0)', async () => {
      repo._qb.execute.mockResolvedValueOnce({ affected: 0 })
      await service.refundEnrichmentCredit('solo-1')
      expect(ledgerRepo.insert).not.toHaveBeenCalled()
    })

    it('records against the OWNER, not the member, for a shared-pool refund', async () => {
      resolveActiveWorkspace.mockResolvedValueOnce({ workspaceId: 'ws-9', role: 'member' })
      workspacesRepo.findOne.mockResolvedValueOnce({ id: 'ws-9', owner_user_id: 'owner-1' } as WorkspaceEntity)
      repo._qb.execute.mockResolvedValueOnce({ affected: 1 })
      await service.refundEnrichmentCredit('member-1')
      expect(ledgerRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({ owner_user_id: 'owner-1', actor_user_id: 'member-1', workspace_id: 'ws-9' }),
      )
    })
  })

  describe('credit ledger (Théo §14 — ledger crédits fiable)', () => {
    it('writes a consume_analysis entry (delta -10) when a slot is claimed', async () => {
      repo._qb.execute.mockResolvedValueOnce({ affected: 1 })
      repo.findOne.mockResolvedValueOnce({ accounts_used: 2, accounts_limit: 3 } as SubscriptionEntity)

      await service.consumeAnalysisSlot('solo-1', { reason: 'Doctolib', accountId: 'acc-1' })

      expect(ledgerRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          owner_user_id: 'solo-1',
          kind: 'consume_analysis',
          resource: 'analysis_slot',
          delta: -10,
          reason: 'Doctolib',
          account_id: 'acc-1',
        }),
      )
    })

    it('does NOT write a consume entry when the quota is full (affected: 0)', async () => {
      repo._qb.execute.mockResolvedValueOnce({ affected: 0 })
      repo.findOne.mockResolvedValueOnce({ accounts_used: 3, accounts_limit: 3 } as SubscriptionEntity)

      await service.consumeAnalysisSlot('solo-1')

      expect(ledgerRepo.insert).not.toHaveBeenCalled()
    })

    it('n’écrit RIEN au registre quand la ligne manquait — le semis ne consomme plus', async () => {
      // Le chemin « seed-and-claim » n'existe plus : depuis le 02/09/2026 le
      // semis pose une ligne à zéro crédit et REFUSE l'analyse. Un débit inscrit
      // pour une action qui n'a pas eu lieu fausserait la reddition de comptes —
      // et rendrait un remboursement dû pour un run jamais lancé.
      repo._qb.execute.mockResolvedValueOnce({ affected: 0 })
      repo.findOne.mockResolvedValueOnce(null)

      await service.consumeAnalysisSlot('new-user')

      expect(ledgerRepo.insert).not.toHaveBeenCalled()
    })

    it('writes a refund_analysis entry for the amount actually debited when a row was decremented', async () => {
      repo._qb.execute.mockResolvedValueOnce({ affected: 1 })
      await service.refundAnalysisSlot('solo-1', { reason: 'échec run: Doctolib', accountId: 'acc-1' })
      // Sans ligne de débit au registre, on rend le coût par défaut d'une
      // analyse complète — 8 depuis la pondération, jamais le `1` historique.
      expect(ledgerRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'refund_analysis', resource: 'analysis_slot', delta: 8, account_id: 'acc-1' }),
      )
    })

    it('does NOT write a refund entry when no row was touched (affected: 0)', async () => {
      repo._qb.execute.mockResolvedValueOnce({ affected: 0 })
      await service.refundAnalysisSlot('solo-1')
      expect(ledgerRepo.insert).not.toHaveBeenCalled()
    })

    it('writes a consume_enrichment entry (delta -1) when a credit is spent', async () => {
      repo._qb.execute.mockResolvedValueOnce({ affected: 1 })
      repo.findOne.mockResolvedValueOnce({ enrichment_credits: 9 } as SubscriptionEntity)
      await service.consumeEnrichmentCredit('solo-1', { reason: 'enrichissement: Jane Doe', accountId: 'acc-2' })
      expect(ledgerRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'consume_enrichment',
          resource: 'enrichment_credit',
          delta: -1,
          account_id: 'acc-2',
        }),
      )
    })

    it('records against the OWNER, not the member, for a shared-pool consume', async () => {
      resolveActiveWorkspace.mockResolvedValueOnce({ workspaceId: 'ws-9', role: 'member' })
      workspacesRepo.findOne.mockResolvedValueOnce({ id: 'ws-9', owner_user_id: 'owner-1' } as WorkspaceEntity)
      repo._qb.execute.mockResolvedValueOnce({ affected: 1 })
      repo.findOne.mockResolvedValueOnce({ accounts_used: 8, accounts_limit: 30 } as SubscriptionEntity)

      await service.consumeAnalysisSlot('member-1')

      expect(ledgerRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({ owner_user_id: 'owner-1', actor_user_id: 'member-1', workspace_id: 'ws-9' }),
      )
    })

    it('never throws if the ledger write fails — the consume still succeeds', async () => {
      repo._qb.execute.mockResolvedValueOnce({ affected: 1 })
      repo.findOne.mockResolvedValueOnce({ accounts_used: 2, accounts_limit: 3 } as SubscriptionEntity)
      ledgerRepo.insert.mockRejectedValueOnce(new Error('db down'))

      const res = await service.consumeAnalysisSlot('solo-1')

      expect(res).toEqual({ ok: true, used: 2, limit: 3, ledgerId: null })
    })

    it('getLedger returns the owner-scoped entries, newest first', async () => {
      const entries = [{ id: 'l1', kind: 'consume_analysis', delta: -8 }] as unknown as CreditLedgerEntity[]
      ledgerRepo.find.mockResolvedValueOnce(entries)

      const res = await service.getLedger('solo-1')

      expect(res).toEqual({ entries })
      expect(ledgerRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { owner_user_id: 'solo-1' }, order: { created_at: 'DESC' } }),
      )
    })

    it('writes a grant_plan entry on checkout.session.completed', async () => {
      const event = {
        id: 'evt_1',
        type: 'checkout.session.completed',
        data: { object: { metadata: { userId: 'user-1', plan: 'team' }, customer: 'cus_1', subscription: 'sub_1' } },
      } as never
      repo.findOne.mockResolvedValueOnce(null)

      await service.handleWebhookEvent(event)

      expect(ledgerRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({ owner_user_id: 'user-1', kind: 'grant_plan', delta: 600 }), // team → 75 analyses
      )
    })
  })

  describe('listInvoices', () => {
    it('returns an empty list when the user has no Stripe customer', async () => {
      repo.findOne.mockResolvedValueOnce({ stripe_customer_id: null } as SubscriptionEntity)
      const res = await service.listInvoices('user-1')
      expect(res).toEqual({ invoices: [] })
      expect(listInvoices).not.toHaveBeenCalled()
    })

    it('maps Stripe invoices to a flat UI shape', async () => {
      repo.findOne.mockResolvedValueOnce({ stripe_customer_id: 'cus_1' } as SubscriptionEntity)
      listInvoices.mockResolvedValueOnce([
        {
          id: 'in_1',
          number: 'BELLUM-001',
          total: 9900,
          currency: 'eur',
          status: 'paid',
          created: 1_700_000_000,
          hosted_invoice_url: 'https://stripe.test/in_1',
          invoice_pdf: 'https://stripe.test/in_1.pdf',
        },
      ])
      const res = await service.listInvoices('user-1')
      expect(listInvoices).toHaveBeenCalledWith('cus_1')
      expect(res.invoices).toEqual([
        {
          id: 'in_1',
          number: 'BELLUM-001',
          amount: 9900,
          currency: 'eur',
          status: 'paid',
          created: 1_700_000_000,
          hosted_invoice_url: 'https://stripe.test/in_1',
          invoice_pdf: 'https://stripe.test/in_1.pdf',
        },
      ])
    })

    it('degrades to an empty list when Stripe throws', async () => {
      repo.findOne.mockResolvedValueOnce({ stripe_customer_id: 'cus_1' } as SubscriptionEntity)
      listInvoices.mockRejectedValueOnce(new Error('no such customer'))
      const res = await service.listInvoices('user-1')
      expect(res).toEqual({ invoices: [] })
    })
  })

  describe('getUsage', () => {
    it('returns 30 ordered zero-filled days when there is no activity', async () => {
      accountsRepo._qb.getRawMany.mockResolvedValueOnce([])
      const res = await service.getUsage('user-1')
      expect(res.usage).toHaveLength(30)
      expect(res.total).toBe(0)
      expect(res.usage.every(point => point.value === 0)).toBe(true)
      // Days are ordered ascending (oldest first).
      const days = res.usage.map(point => point.day)
      expect([...days].sort()).toEqual(days)
    })

    it('fills real per-day counts from the accounts aggregation', async () => {
      const today = new Date().toISOString().slice(0, 10)
      accountsRepo._qb.getRawMany.mockResolvedValueOnce([{ day: today, count: '3' }])
      const res = await service.getUsage('user-1')
      expect(res.total).toBe(3)
      expect(res.usage.find(point => point.day === today)?.value).toBe(3)
    })
  })

  describe('workspace démo (demo mode C1) — AUCUN débit', () => {
    /** Marks the caller's active workspace as a demo space. */
    function makeDemoWorkspace() {
      workspacesRepo.findOne.mockResolvedValue({
        id: 'ws-1',
        owner_user_id: 'demo-owner',
        is_demo: true,
      } as WorkspaceEntity)
    }

    it('consumeAnalysisSlot returns ok WITHOUT touching the balance or the ledger', async () => {
      makeDemoWorkspace()
      const res = await service.consumeAnalysisSlot('demo-owner', { reason: 'Groupe Helios' })
      expect(res.ok).toBe(true)
      // No guarded UPDATE, no seed-save, no audit line — nothing was debited.
      expect(repo._qb.execute).not.toHaveBeenCalled()
      expect(repo.save).not.toHaveBeenCalled()
      expect(ledgerRepo.insert).not.toHaveBeenCalled()
    })

    it('consumeEnrichmentCredit returns ok WITHOUT touching the balance or the ledger', async () => {
      makeDemoWorkspace()
      const res = await service.consumeEnrichmentCredit('demo-owner', { reason: 'enrich' })
      expect(res.ok).toBe(true)
      expect(repo._qb.execute).not.toHaveBeenCalled()
      expect(ledgerRepo.insert).not.toHaveBeenCalled()
    })

    it('a demo MEMBER (not just the owner) is also free — the owner pool is never debited', async () => {
      resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'ws-1', role: 'member' })
      makeDemoWorkspace()
      const res = await service.consumeAnalysisSlot('demo-member')
      expect(res.ok).toBe(true)
      expect(repo._qb.execute).not.toHaveBeenCalled()
      expect(ledgerRepo.insert).not.toHaveBeenCalled()
    })

    it('refunds are no-ops (nothing was debited, the pool must not inflate)', async () => {
      makeDemoWorkspace()
      await service.refundAnalysisSlot('demo-owner')
      await service.refundEnrichmentCredit('demo-owner')
      expect(repo._qb.execute).not.toHaveBeenCalled()
      expect(ledgerRepo.insert).not.toHaveBeenCalled()
    })

    it('hasEnrichmentCredit is always true for a demo workspace (UI never gated)', async () => {
      makeDemoWorkspace()
      repo.findOne.mockResolvedValue({ enrichment_credits: 0 } as SubscriptionEntity)
      await expect(service.hasEnrichmentCredit('demo-owner')).resolves.toBe(true)
    })

    it('getCredits exposes is_demo=true and never reports a locked trial', async () => {
      makeDemoWorkspace()
      const past = new Date(Date.now() - 1000)
      repo.findOne.mockResolvedValueOnce({
        user_id: 'demo-owner',
        plan: 'trial',
        accounts_limit: 40,
        accounts_used: 0,
        trial_end: past,
      } as SubscriptionEntity)
      const result = await service.getCredits('demo-owner')
      expect(result.is_demo).toBe(true)
      // The billing lock is real-plan machinery — a demo space is never locked.
      expect(result.trial_expired).toBe(false)
    })

    it('getCredits reports is_demo=false on the regular (non-demo) path', async () => {
      const result = await service.getCredits('user-1')
      expect(result.is_demo).toBe(false)
    })

    it('a NON-demo workspace still debits (the short-circuit is demo-only)', async () => {
      workspacesRepo.findOne.mockResolvedValue({
        id: 'ws-1',
        owner_user_id: 'user-1',
        is_demo: false,
      } as WorkspaceEntity)
      repo._qb.execute.mockResolvedValueOnce({ affected: 1 })
      repo.findOne.mockResolvedValueOnce({ accounts_used: 1, accounts_limit: 3 } as SubscriptionEntity)
      const res = await service.consumeAnalysisSlot('user-1')
      expect(res).toEqual({ ok: true, used: 1, limit: 3, ledgerId: null })
      expect(repo._qb.execute).toHaveBeenCalled()
      expect(ledgerRepo.insert).toHaveBeenCalled()
    })
  })

  // #4158.35 — achat self-serve de sièges : l'écran envoie `extra_seats`, le
  // checkout le met en métadonnée, et c'est CE webhook qui le pose sur
  // l'abonnement. Sans ce test, le dernier maillon du parcours n'était prouvé
  // par aucun test (seul le côté checkout l'était).
  describe('achat de sièges : webhook checkout.session.completed → extra_seats', () => {
    const completed = (extraSeats: string | undefined): never =>
      ({
        id: 'evt_seats',
        type: 'checkout.session.completed',
        data: {
          object: {
            customer: 'cus_1',
            subscription: 'sub_1',
            currency: 'eur',
            metadata: { userId: 'owner-1', plan: 'team', ...(extraSeats !== undefined && { extra_seats: extraSeats }) },
          },
        },
      }) as never

    it('pose les sièges achetés sur l’abonnement du propriétaire', async () => {
      await service.handleWebhookEvent(completed('4'))
      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'owner-1', extra_seats: 4 }))
    })

    it('plafonne à MAX_EXTRA_SEATS (47) : une métadonnée forgée n’ouvre pas 999 sièges', async () => {
      await service.handleWebhookEvent(completed('999'))
      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ extra_seats: 47 }))
    })

    it('sans sièges achetés, extra_seats vaut 0', async () => {
      await service.handleWebhookEvent(completed(undefined))
      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ extra_seats: 0 }))
    })
  })
})
