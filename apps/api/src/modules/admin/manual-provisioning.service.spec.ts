import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { localDayKey } from '@bellum/contracts'
import { ManualProvisioningService } from './manual-provisioning.service'
import { addDays } from './manual-billing-schedule'
import { PlanCatalogService } from '../credits/plan-catalog.service'
import { CreditLedgerEntity } from '../../database/entities/credit-ledger.entity'
import { PlanDefinitionEntity } from '../../database/entities/plan-definition.entity'
import { ManualBillingInvoiceEntity } from '../../database/entities/manual-billing-invoice.entity'
import { ManualBillingTermsEntity } from '../../database/entities/manual-billing-terms.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { SubscriptionEntity } from '../../database/entities/subscription.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'
import type { ProvisionClientInput } from './manual-provisioning.service'

const OWNER_ID = '11111111-1111-4111-8111-111111111111'
const WORKSPACE_ID = '22222222-2222-4222-8222-222222222222'

/** Minimal valid payload — one ESN, one owner, a paid plan, offline terms. */
const input = (over: Partial<ProvisionClientInput> = {}): ProvisionClientInput => ({
  esnName: 'Skaizen',
  owner: { email: 'Theo@Skaizen.fr', firstName: 'Théo', lastName: 'Martin' },
  plan: 'team',
  extraSeats: 0,
  billing: {
    amountCents: 259000,
    currency: 'EUR',
    period: 'yearly',
    startDate: '2026-08-01',
    paymentStatus: 'unpaid',
    reference: 'FA-2026-042',
  },
  team: [],
  ...over,
})

describe('ManualProvisioningService', () => {
  let service: ManualProvisioningService
  let profiles: MockRepository<ProfileEntity>
  let subscriptions: MockRepository<SubscriptionEntity>
  let workspaces: MockRepository<WorkspaceEntity>
  let members: MockRepository<WorkspaceMemberEntity>
  let terms: MockRepository<ManualBillingTermsEntity>
  let invoices: MockRepository<ManualBillingInvoiceEntity>
  let creditLedger: MockRepository<CreditLedgerEntity>
  let createUser: jest.Mock
  let deleteUser: jest.Mock
  let createInvitationWithDelivery: jest.Mock
  let generateResetLink: jest.Mock
  let persistOwnerActivation: jest.Mock
  let sendOwnerActivation: jest.Mock
  let transaction: jest.Mock

  /**
   * Chaque écriture, avec la réponse à LA question du lot : « avait-elle lieu
   * la transaction OUVERTE ? ».
   *
   * ⚠️ Sans cette mesure, un `this.workspaces.save()` glissé dans le chemin de
   * provisionnement écrirait HORS transaction, ne serait donc PAS annulé — et
   * tous les tests existants passeraient quand même, parce qu'ils vérifient
   * seulement QUE l'écriture a eu lieu. C'est exactement le défaut que ce lot
   * corrige : personne ne peut voir un `ROLLBACK` manquant en lisant des appels.
   */
  let writes: Array<{ repo: string; duringTransaction: boolean }>
  let txOpen: boolean
  let logJournal: jest.SpyInstance
  let erreurs: jest.SpyInstance

  beforeEach(() => {
    profiles = createMockRepository<ProfileEntity>()
    subscriptions = createMockRepository<SubscriptionEntity>()
    workspaces = createMockRepository<WorkspaceEntity>()
    members = createMockRepository<WorkspaceMemberEntity>()
    terms = createMockRepository<ManualBillingTermsEntity>()
    invoices = createMockRepository<ManualBillingInvoiceEntity>()
    creditLedger = createMockRepository<CreditLedgerEntity>()

    // Real catalog over a mock repo → shipped defaults (team: 50 analyses,
    // 100 enrichments, 3 seats).
    const planRepo = createMockRepository<PlanDefinitionEntity>()
    const planCatalog = new PlanCatalogService(planRepo as never)

    createUser = jest.fn().mockResolvedValue({ data: { user: { id: OWNER_ID } }, error: null })
    deleteUser = jest.fn().mockResolvedValue({ data: null, error: null })
    createInvitationWithDelivery = jest.fn().mockResolvedValue({
      invitation: { id: 'inv-1', email: 'sales@skaizen.fr', role: 'member' },
      emailSent: true,
      emailError: null,
    })
    generateResetLink = jest.fn().mockResolvedValue({
      link: 'https://app.bellum.ai/auth/reset-password?t=abc&e=1',
      email: 'theo@skaizen.fr',
      expiresAt: '2026-09-09T10:00:00.000Z',
      ttl: '48h',
      clamped: false,
    })
    persistOwnerActivation = jest.fn().mockResolvedValue(undefined)
    sendOwnerActivation = jest.fn()

    // New owner by default: no profile, no workspace. The auth trigger normally
    // seeds profile + workspace; specs simulate the post-createUser reads.
    workspaces.findOne.mockResolvedValue(null)
    workspaces.save.mockImplementation(async (w: Partial<WorkspaceEntity>) => ({
      ...w,
      id: WORKSPACE_ID,
      created_at: new Date(),
    }))

    writes = []
    txOpen = false
    const repoByEntity = new Map<unknown, unknown>([
      [WorkspaceEntity, workspaces],
      [WorkspaceMemberEntity, members],
      [SubscriptionEntity, subscriptions],
      [ManualBillingTermsEntity, terms],
      [ManualBillingInvoiceEntity, invoices],
      [CreditLedgerEntity, creditLedger],
    ])
    for (const [entity, repo] of repoByEntity) {
      recordWrites((entity as { name: string }).name, repo as MockRepository)
    }

    const manager = {
      getRepository: (entity: unknown) => {
        const found = repoByEntity.get(entity)
        if (!found) throw new Error(`Aucun dépôt simulé pour ${String(entity)}`)
        return found
      },
    }
    transaction = jest.fn(async (run: (m: unknown) => Promise<unknown>) => {
      txOpen = true
      try {
        return await run(manager)
      } finally {
        txOpen = false
      }
    })

    service = new ManualProvisioningService(
      profiles as never,
      subscriptions as never,
      workspaces as never,
      members as never,
      terms as never,
      invoices as never,
      creditLedger as never,
      { transaction } as never,
      planCatalog,
      { getClient: () => ({ auth: { admin: { createUser, deleteUser } } }) } as never,
      { createInvitationWithDelivery } as never,
      { generateResetLink } as never,
      { persist: persistOwnerActivation, send: sendOwnerActivation } as never,
    )

    // Le journal d'audit part à CHAQUE provisionnement, avec sa charge utile
    // complète : le laisser s'écrire noierait la sortie de la CI sous soixante
    // objets. Il est capturé plutôt qu'affiché — et `logJournal` reste lisible
    // par le test qui vérifie qu'il porte bien son auteur.
    logJournal = jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined)
    // Les échecs sont ATTENDUS dans la moitié de ce fichier : laisser leurs
    // piles d'appel s'imprimer rendrait la sortie de la CI illisible et
    // ferait passer un vrai rouge pour du bruit.
    erreurs = jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    logJournal.mockRestore()
    erreurs.mockRestore()
  })

  /** Note chaque écriture ET l'état de la transaction au moment où elle a lieu. */
  function recordWrites(label: string, repo: MockRepository): void {
    for (const method of ['save', 'insert', 'update', 'delete', 'upsert'] as const) {
      const fn = repo[method] as jest.Mock
      const previous = fn.getMockImplementation()
      fn.mockImplementation((...args: unknown[]) => {
        writes.push({ repo: label, duringTransaction: txOpen })
        return previous ? previous(...args) : Promise.resolve(args[0])
      })
    }
  }

  describe('owner account', () => {
    it('creates the auth user WITHOUT ever setting a password', async () => {
      await service.provisionClient(input())

      expect(createUser).toHaveBeenCalledTimes(1)
      const payload = createUser.mock.calls[0]![0] as Record<string, unknown>
      // The human sets their own credentials via the reset-link flow. Minting a
      // password on someone's behalf is out of bounds — this is the tripwire.
      expect(payload).not.toHaveProperty('password')
      expect(payload.email).toBe('theo@skaizen.fr')
    })

    it('normalises the owner email (trim + lowercase) before every lookup', async () => {
      await service.provisionClient(input({ owner: { email: '  Theo@Skaizen.FR ' } }))
      expect(profiles.findOne).toHaveBeenCalledWith({ where: { email: 'theo@skaizen.fr' } })
    })

    it('surfaces a Supabase failure instead of half-provisioning', async () => {
      createUser.mockResolvedValue({ data: null, error: { message: 'rate limited' } })
      await expect(service.provisionClient(input())).rejects.toBeInstanceOf(BadRequestException)
      expect(workspaces.save).not.toHaveBeenCalled()
    })

    it('reuses an existing account rather than creating a duplicate (idempotent)', async () => {
      profiles.findOne.mockResolvedValue({ user_id: OWNER_ID, email: 'theo@skaizen.fr' } as ProfileEntity)
      workspaces.findOne.mockResolvedValue({
        id: WORKSPACE_ID,
        name: 'Mon espace',
        owner_user_id: OWNER_ID,
      } as WorkspaceEntity)

      const result = await service.provisionClient(input())

      expect(createUser).not.toHaveBeenCalled()
      expect(result.owner.created).toBe(false)
      expect(result.workspaceId).toBe(WORKSPACE_ID)
      // Re-provisioning renames in place — never a second workspace.
      expect(workspaces.save).toHaveBeenCalledWith(expect.objectContaining({ id: WORKSPACE_ID, name: 'Skaizen' }))
    })

    it('refuses to hijack an account that already has a live Stripe subscription', async () => {
      profiles.findOne.mockResolvedValue({ user_id: OWNER_ID, email: 'theo@skaizen.fr' } as ProfileEntity)
      subscriptions.findOne.mockResolvedValue({
        user_id: OWNER_ID,
        plan: 'team',
        stripe_subscription_id: 'sub_live_123',
        billing_mode: 'stripe',
      } as SubscriptionEntity)

      await expect(service.provisionClient(input())).rejects.toBeInstanceOf(ConflictException)
      expect(subscriptions.save).not.toHaveBeenCalled()
    })

    it('converts a self-signed-up trial (no Stripe) to manual — the real sales case', async () => {
      profiles.findOne.mockResolvedValue({ user_id: OWNER_ID, email: 'theo@skaizen.fr' } as ProfileEntity)
      subscriptions.findOne.mockResolvedValue({
        user_id: OWNER_ID,
        plan: 'trial',
        stripe_subscription_id: null,
        trial_end: new Date('2020-01-01'),
        accounts_used: 12,
      } as SubscriptionEntity)
      workspaces.findOne.mockResolvedValue({ id: WORKSPACE_ID, owner_user_id: OWNER_ID } as WorkspaceEntity)

      await service.provisionClient(input())

      expect(subscriptions.save).toHaveBeenCalledWith(
        expect.objectContaining({ plan: 'team', billing_mode: 'manual', trial_end: null, accounts_used: 0 }),
      )
    })
  })

  describe('subscription written for an invoice-billed client', () => {
    it('stamps billing_mode=manual and leaves the Stripe ids NULL', async () => {
      await service.provisionClient(input())

      const saved = subscriptions.save.mock.calls[0]![0] as Partial<SubscriptionEntity>
      expect(saved.billing_mode).toBe('manual')
      expect(saved.stripe_customer_id ?? null).toBeNull()
      // NULL (not '' / 'manual'): the two webhook UPDATEs match on
      // `stripe_subscription_id = :id`, and only SQL NULL never matches.
      expect(saved.stripe_subscription_id ?? null).toBeNull()
    })

    it('clears trial_end so the client is never locked by a stale trial window', async () => {
      const saved = (await provisionAndGetSub()) as Partial<SubscriptionEntity>
      expect(saved.trial_end).toBeNull()
    })

    it('anchors period_start at provisioning so the monthly reset lands a month later', async () => {
      const before = Date.now()
      const saved = (await provisionAndGetSub()) as Partial<SubscriptionEntity>
      expect(saved.period_start).toBeInstanceOf(Date)
      expect(saved.period_start!.getTime()).toBeGreaterThanOrEqual(before)
    })

    it('takes quotas from the plan catalog by default', async () => {
      const saved = (await provisionAndGetSub()) as Partial<SubscriptionEntity>
      expect(saved.plan).toBe('team')
      expect(saved.accounts_limit).toBe(600) // grille pondérée : 75 analyses
      expect(saved.enrichment_credits).toBe(0)
    })

    it('lets the operator override the negotiated quotas', async () => {
      const saved = (await provisionAndGetSub({
        accountsLimit: 500,
        enrichmentCredits: 2000,
      })) as Partial<SubscriptionEntity>
      expect(saved.accounts_limit).toBe(500)
      expect(saved.enrichment_credits).toBe(2000)
    })

    it('grants negotiated seats through extra_seats (3 included + 7 = 10)', async () => {
      const saved = (await provisionAndGetSub({ extraSeats: 7 })) as Partial<SubscriptionEntity>
      expect(saved.extra_seats).toBe(7)
    })

    async function provisionAndGetSub(over: Partial<ProvisionClientInput> = {}) {
      await service.provisionClient(input(over))
      return subscriptions.save.mock.calls[0]![0]
    }
  })

  describe('commercial terms', () => {
    it('records the offline terms against the workspace', async () => {
      await service.provisionClient(input())

      expect(terms.save).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace_id: WORKSPACE_ID,
          amount_cents: 259000,
          currency: 'EUR',
          period: 'yearly',
          reference: 'FA-2026-042',
        }),
      )
    })

    it('updates the existing terms row on re-provisioning instead of duplicating', async () => {
      terms.findOne.mockResolvedValue({ id: 'terms-1', workspace_id: WORKSPACE_ID } as ManualBillingTermsEntity)
      await service.provisionClient(input())
      expect(terms.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'terms-1' }))
    })

    it('stores the commitment as a NUMBER of months, with the billing recipient beside it', async () => {
      // Ce qui vivait dans une phrase de `notes` — « engagement 3 mois,
      // facturé à Julien en particulier, 06 37 … » — et qu'aucun code ne
      // pouvait relire.
      await service.provisionClient(
        input({
          billing: {
            amountCents: 11900,
            period: 'monthly',
            startDate: '2026-09-01',
            commitmentMonths: 3,
            billedToName: 'Julien Laszlo',
            billedToKind: 'person',
            billingEmail: '  Julien.Laszlo@Gmail.com ',
            billingPhone: '06 37 71 74 80',
            paymentStatus: 'paid',
            reference: 'F-2026-006',
          },
        }),
      )

      expect(terms.save).toHaveBeenCalledWith(
        expect.objectContaining({
          commitment_months: 3,
          billed_to_name: 'Julien Laszlo',
          billed_to_kind: 'person',
          billing_email: 'julien.laszlo@gmail.com',
          billing_phone: '06 37 71 74 80',
        }),
      )
    })

    it('leaves the commitment NULL when none was agreed — never 0', async () => {
      await service.provisionClient(input())
      expect(terms.save).toHaveBeenCalledWith(expect.objectContaining({ commitment_months: null }))
      // « 0 mois » se lirait comme un contrat clos le jour de sa signature.
      expect(terms.save).not.toHaveBeenCalledWith(expect.objectContaining({ commitment_months: 0 }))
    })

    it('derives the commitment end without storing it', async () => {
      const result = await service.provisionClient(
        input({
          billing: {
            amountCents: 11900,
            period: 'monthly',
            startDate: '2026-09-01',
            commitmentMonths: 3,
            reference: 'F-2026-006',
          },
        }),
      )
      expect(result.terms.commitmentEnd).toBe('2026-11-30')
      expect(terms.save).toHaveBeenCalledWith(expect.not.objectContaining({ commitment_end: expect.anything() }))
    })
  })

  describe('invoice ledger', () => {
    it('opens the ledger with the first invoice, over the first period', async () => {
      await service.provisionClient(
        input({
          billing: {
            amountCents: 11900,
            period: 'monthly',
            startDate: '2026-09-01',
            commitmentMonths: 3,
            paymentStatus: 'paid',
            reference: 'F-2026-006',
          },
        }),
      )

      expect(invoices.save).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace_id: WORKSPACE_ID,
          reference: 'F-2026-006',
          period_start: '2026-09-01',
          period_end: '2026-09-30',
          payment_status: 'paid',
          // Encaissée, date inconnue : on ne fabrique pas le jour où l'argent
          // est arrivé sous prétexte qu'on sait qu'il est arrivé.
          paid_on: null,
          issued_on: null,
        }),
      )
    })

    it('writes NO invoice when the operator has no reference yet', async () => {
      await service.provisionClient(
        input({ billing: { amountCents: 11900, period: 'monthly', startDate: '2026-09-01' } }),
      )
      // Une facture sans numéro prétendrait qu'un document existe. La première
      // période sera signalée manquante — ce qui est vrai.
      expect(invoices.save).not.toHaveBeenCalled()
    })

    it('does not double the first invoice when the same client is re-provisioned', async () => {
      invoices._qb.getOne.mockResolvedValue({ id: 'inv-1', reference: 'FA-2026-042' })
      await service.provisionClient(input())
      expect(invoices.save).not.toHaveBeenCalled()
    })

    it('defaults a recorded invoice to the OLDEST period the ledger misses', async () => {
      terms.findOne.mockResolvedValue({
        workspace_id: WORKSPACE_ID,
        period: 'monthly',
        start_date: '2020-01-01',
        commitment_months: null,
        amount_cents: 11900,
        currency: 'EUR',
      } as ManualBillingTermsEntity)
      invoices.find.mockResolvedValue([])

      await service.recordInvoice(WORKSPACE_ID, { reference: 'F-2026-050' })

      expect(invoices.save).toHaveBeenCalledWith(
        expect.objectContaining({ period_start: '2020-01-01', period_end: '2020-01-31' }),
      )
    })

    it('refuses the same reference twice — a period covered twice hides the one that is not', async () => {
      terms.findOne.mockResolvedValue({
        workspace_id: WORKSPACE_ID,
        period: 'monthly',
        start_date: '2026-09-01',
        amount_cents: 11900,
        currency: 'EUR',
      } as ManualBillingTermsEntity)
      invoices._qb.getOne.mockResolvedValue({ id: 'inv-1', reference: 'F-2026-006' })

      await expect(service.recordInvoice(WORKSPACE_ID, { reference: 'F-2026-006' })).rejects.toBeInstanceOf(
        ConflictException,
      )
    })

    it('clears the cash-in date when an invoice is put back to unpaid', async () => {
      invoices.findOne.mockResolvedValue({
        id: 'inv-1',
        reference: 'F-2026-006',
        period_start: '2026-09-01',
        period_end: '2026-09-30',
        payment_status: 'paid',
        paid_on: '2026-09-03',
      } as never)

      const row = await service.updateInvoice('inv-1', { paymentStatus: 'unpaid' })

      // Une date d'encaissement sur une facture impayée est une contradiction
      // écrite en base ; c'est le genre de ligne qu'on relit six mois plus tard.
      expect(row.paidOn).toBeNull()
    })
  })

  describe('team invitations — honest delivery reporting', () => {
    it('invites each teammate through the existing workspace invitation flow', async () => {
      await service.provisionClient(
        input({
          team: [
            { email: 'sales@skaizen.fr', role: 'member' },
            { email: 'ops@skaizen.fr', role: 'admin' },
          ],
        }),
      )

      expect(createInvitationWithDelivery).toHaveBeenCalledTimes(2)
      // Invited AS the owner, so seat limits and the invite dedupe still apply.
      expect(createInvitationWithDelivery).toHaveBeenCalledWith(OWNER_ID, {
        email: 'sales@skaizen.fr',
        role: 'member',
      })
    })

    it('reports an invitation whose email never left — never as a success', async () => {
      createInvitationWithDelivery.mockResolvedValue({
        invitation: { id: 'inv-1', email: 'sales@skaizen.fr', role: 'member' },
        emailSent: false,
        emailError: 'Resend API error: domain not verified',
      })

      const result = await service.provisionClient(input({ team: [{ email: 'sales@skaizen.fr', role: 'member' }] }))

      expect(result.invitations[0]).toMatchObject({
        email: 'sales@skaizen.fr',
        created: true,
        emailSent: false,
        error: 'Resend API error: domain not verified',
      })
      // A client provisioned but never notified is the failure the operator
      // would otherwise discover by phone.
      expect(result.fullyNotified).toBe(false)
    })

    it('keeps the workspace when one invitation fails outright (partial success is reported, not rolled back)', async () => {
      createInvitationWithDelivery
        .mockResolvedValueOnce({ invitation: { id: 'i1' }, emailSent: true, emailError: null })
        .mockRejectedValueOnce(new Error('Sièges épuisés (3/3).'))

      const result = await service.provisionClient(
        input({
          team: [
            { email: 'a@skaizen.fr', role: 'member' },
            { email: 'b@skaizen.fr', role: 'member' },
          ],
        }),
      )

      expect(result.workspaceId).toBe(WORKSPACE_ID)
      expect(result.invitations[1]).toMatchObject({ created: false, emailSent: false })
      expect(result.invitations[1]!.error).toContain('Sièges épuisés')
      expect(result.fullyNotified).toBe(false)
    })

    it('dedupes the owner out of the team list (they are already a member)', async () => {
      await service.provisionClient(
        input({
          team: [
            { email: 'THEO@skaizen.fr', role: 'admin' },
            { email: 'sales@skaizen.fr', role: 'member' },
          ],
        }),
      )
      expect(createInvitationWithDelivery).toHaveBeenCalledTimes(1)
      expect(createInvitationWithDelivery).toHaveBeenCalledWith(OWNER_ID, {
        email: 'sales@skaizen.fr',
        role: 'member',
      })
    })

    it('reports fullyNotified when every invitation left', async () => {
      const result = await service.provisionClient(input({ team: [{ email: 'sales@skaizen.fr', role: 'member' }] }))
      expect(result.fullyNotified).toBe(true)
    })
  })

  /**
   * ⚠️ CE TEST A CHANGÉ DE FORME LE 07/09/2026, ET LA RAISON EST ÉCRITE ICI.
   *
   * Il interdisait `/access_token|action_link|password/i` dans TOUTE la réponse.
   * Depuis #1665, la réponse porte le lien de définition de mot de passe du
   * propriétaire — dont l'URL contient le mot « password » parce que l'écran qui
   * le consomme s'appelle `/auth/reset-password`. Le motif attrapait donc un
   * chemin d'écran, pas un secret.
   *
   * Ce qui reste interdit, et qui est le vrai sujet :
   *  · `access_token` — une session ouverte à la place de quelqu'un ;
   *  · `action_link` / `hashed_token` — le lien SUPABASE BRUT, celui qui atterrit
   *    sur la racine où aucun écran ne sait le consommer (défaut du 20/08) ;
   *  · un mot de passe, qu'on ne crée jamais pour personne.
   *
   * Et ce qui est AJOUTÉ, parce que c'est là que ça compte vraiment : la charge
   * utile JOURNALISÉE ne porte aucun lien. Une réponse HTTP va sur l'écran d'un
   * opérateur déjà authentifié ; un journal se garde, se réplique et s'exporte.
   */
  it('ne rend ni session, ni lien Supabase brut, ni mot de passe', async () => {
    const result = await service.provisionClient(input())
    expect(JSON.stringify(result)).not.toMatch(/access_token|action_link|hashed_token/i)
    expect(JSON.stringify(result)).not.toMatch(/"password"/i)
  })

  it('le JOURNAL ne porte aucun lien — une réponse s’affiche, un journal se conserve', async () => {
    const result = await service.provisionClient(input())
    // Le lien EST dans la réponse (l'opérateur doit pouvoir l'envoyer)…
    expect(result.ownerInvitation?.link).toContain('reset-password')
    // …et il n'est PAS dans ce qui part au journal.
    expect(JSON.stringify(result.audit)).not.toContain('reset-password')
    expect(JSON.stringify(result.audit)).not.toContain('http')
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * #1665 — « SI UNE ÉTAPE ÉCHOUE, TOUT EST ANNULÉ. PAS D'ESPACE ORPHELIN. »
   * ═══════════════════════════════════════════════════════════════════════════
   * Le triage du 07/09 l'avait mesuré : `grep "transaction|rollback"` ne
   * remontait RIEN sur ce fichier. Un échec à l'étape 4 laissait un espace et un
   * propriétaire déjà écrits, en production.
   */
  describe('tout ou rien (règle 1 · T1)', () => {
    it('toutes les écritures SQL ont lieu la transaction OUVERTE', async () => {
      await service.provisionClient(input())

      expect(transaction).toHaveBeenCalledTimes(1)
      expect(writes.length).toBeGreaterThan(0)
      // Une seule écriture hors transaction suffit à laisser un orphelin.
      expect(writes.filter(w => !w.duringTransaction)).toEqual([])
    })

    it('T1 — un échec à l’étape 4 (crédits) n’écrit ni espace ni utilisateur', async () => {
      creditLedger.insert.mockRejectedValue(new Error('deadlock detected'))

      await expect(service.provisionClient(input())).rejects.toBeInstanceOf(BadRequestException)

      // Les écritures SQL vivaient dans la transaction : le ROLLBACK les défait.
      expect(writes.filter(w => !w.duringTransaction)).toEqual([])
      // Le compte d'authentification, LUI, vit hors SQL : il est COMPENSÉ.
      expect(deleteUser).toHaveBeenCalledWith(OWNER_ID)
      // Et personne n'a été prévenu d'un espace qui n'existe pas.
      expect(createInvitationWithDelivery).not.toHaveBeenCalled()
    })

    it('l’erreur rendue DIT que rien ne subsiste, plutôt que de laisser deviner', async () => {
      terms.save.mockRejectedValue(new Error('violates check constraint'))
      await expect(service.provisionClient(input())).rejects.toThrow(/Tout a été annulé/)
    })

    it('ne supprime JAMAIS un compte qui existait avant ce provisionnement', async () => {
      profiles.findOne.mockResolvedValue({ user_id: OWNER_ID, email: 'theo@skaizen.fr' } as ProfileEntity)
      workspaces.findOne.mockResolvedValue({ id: WORKSPACE_ID, owner_user_id: OWNER_ID } as WorkspaceEntity)
      terms.save.mockRejectedValue(new Error('violates check constraint'))

      await expect(service.provisionClient(input())).rejects.toThrow(/n’est jamais supprimé/)
      // Quelqu'un s'en sert peut-être depuis six mois. Ce n'est pas notre compte.
      expect(deleteUser).not.toHaveBeenCalled()
    })

    it('les e-mails partent APRÈS le commit — jamais depuis l’intérieur de la transaction', async () => {
      await service.provisionClient(input({ team: [{ email: 'sales@skaizen.fr', role: 'member' }] }))

      // `txOpen` est retombé à faux avant l'invitation : un e-mail parti dans une
      // transaction annulée aurait prévenu une équipe d'un espace effacé.
      expect(createInvitationWithDelivery).toHaveBeenCalledTimes(1)
      expect(transaction).toHaveBeenCalledTimes(1)
      const ordreInvitation = createInvitationWithDelivery.mock.invocationCallOrder[0] as number
      const ordreTransaction = transaction.mock.invocationCallOrder[0] as number
      expect(ordreInvitation).toBeGreaterThan(ordreTransaction)
    })
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * UN TIMEOUT N'EST PAS UN ÉCHEC — `unknown` ARRÊTE LA REPRISE
   * ═══════════════════════════════════════════════════════════════════════════
   * La seule question : la requête a-t-elle pu PARTIR ? Ici la conséquence est
   * plus dure qu'ailleurs — une transaction `unknown` a peut-être été COMMISE,
   * et supprimer le propriétaire détruirait un espace vivant.
   */
  describe('ce qui est parti sans réponse (`unknown`)', () => {
    const partieSansReponse = (code: string) => Object.assign(new Error('fetch failed'), { cause: { code } })

    it('une transaction partie sans réponse ne déclenche AUCUNE suppression', async () => {
      terms.save.mockRejectedValue(partieSansReponse('ETIMEDOUT'))

      await expect(service.provisionClient(input())).rejects.toThrow(/peut-être été COMMISE/)
      expect(deleteUser).not.toHaveBeenCalled()
    })

    it('⚠️ `UND_ERR_CONNECT_TIMEOUT` n’est PAS un timeout — la compensation a bien lieu', async () => {
      // La connexion n'a jamais abouti : rien n'est parti, donc rien n'a pu être
      // commis. C'est un échec net, et le compte se supprime sans risque.
      terms.save.mockRejectedValue(partieSansReponse('UND_ERR_CONNECT_TIMEOUT'))

      await expect(service.provisionClient(input())).rejects.toThrow(/Tout a été annulé/)
      expect(deleteUser).toHaveBeenCalledWith(OWNER_ID)
    })

    it('une création de compte partie sans réponse s’arrête AVANT toute écriture SQL', async () => {
      createUser.mockRejectedValue(partieSansReponse('UND_ERR_HEADERS_TIMEOUT'))

      await expect(service.provisionClient(input())).rejects.toThrow(/partie sans réponse/)
      // Ni rejeu (doublon d'identité), ni suppression à l'aveugle.
      expect(createUser).toHaveBeenCalledTimes(1)
      expect(deleteUser).not.toHaveBeenCalled()
      expect(transaction).not.toHaveBeenCalled()
    })

    it('une connexion jamais établie reste un échec rejouable, et le dit', async () => {
      createUser.mockRejectedValue(partieSansReponse('ECONNREFUSED'))
      await expect(service.provisionClient(input())).rejects.toThrow(/Création du compte propriétaire impossible/)
    })

    it('une compensation partie sans réponse ne s’annonce pas comme un succès', async () => {
      terms.save.mockRejectedValue(new Error('violates check constraint'))
      deleteUser.mockRejectedValue(partieSansReponse('ECONNRESET'))

      // « Tout a été annulé » est une phrase de confiance : la dire à tort est
      // pire que ne rien dire, parce que personne n'ira vérifier.
      await expect(service.provisionClient(input())).rejects.toThrow(/peut subsister sans espace/)
    })
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * L'APERÇU (règle 3 · T2) — « affiché AVANT toute écriture »
   * ═══════════════════════════════════════════════════════════════════════════
   */
  describe('aperçu des six étapes', () => {
    it('T2 — n’écrit RIEN : ni compte, ni transaction, ni ligne', async () => {
      await service.previewProvisioning(input({ team: [{ email: 'sales@skaizen.fr', role: 'member' }] }))

      expect(createUser).not.toHaveBeenCalled()
      expect(deleteUser).not.toHaveBeenCalled()
      expect(transaction).not.toHaveBeenCalled()
      expect(createInvitationWithDelivery).not.toHaveBeenCalled()
      expect(generateResetLink).not.toHaveBeenCalled()
      // Aucune écriture, sur aucun dépôt — la mesure, pas la relecture.
      expect(writes).toEqual([])
    })

    it('récapitule les SIX étapes, dans l’ordre du récit de l’issue', async () => {
      const preview = await service.previewProvisioning(input())
      expect(preview.steps.map(s => s.key)).toEqual(['workspace', 'owner', 'plan', 'credits', 'billing', 'invitations'])
      expect(preview.steps.map(s => s.rank)).toEqual([1, 2, 3, 4, 5, 6])
    })

    it('l’aperçu montre l’e-mail SANS son jeton — un aperçu se capture et se partage', async () => {
      const preview = await service.previewProvisioning(input())
      expect(preview.ownerInvitation?.carriesLink).toBe(false)
      expect(preview.ownerInvitation?.body).not.toContain('http')
      expect(preview.ownerInvitation?.to).toBe('theo@skaizen.fr')
    })

    it('nomme ce qui EMPÊCHE le geste, avant que le compte ne soit créé', async () => {
      profiles.findOne.mockResolvedValue({ user_id: OWNER_ID, email: 'theo@skaizen.fr' } as ProfileEntity)
      subscriptions.findOne.mockResolvedValue({
        user_id: OWNER_ID,
        stripe_subscription_id: 'sub_live_123',
      } as SubscriptionEntity)

      const preview = await service.previewProvisioning(input())
      expect(preview.blockers[0]).toContain('abonnement Stripe actif')
    })

    it('dit qu’un compte existant sera RÉUTILISÉ, plutôt que de le laisser découvrir', async () => {
      profiles.findOne.mockResolvedValue({ user_id: OWNER_ID, email: 'theo@skaizen.fr' } as ProfileEntity)
      workspaces.findOne.mockResolvedValue({
        id: WORKSPACE_ID,
        name: 'Mon espace',
        owner_user_id: OWNER_ID,
      } as WorkspaceEntity)

      const preview = await service.previewProvisioning(input())
      expect(preview.steps.find(s => s.key === 'owner')?.action).toBe('reuse')
      expect(preview.steps.find(s => s.key === 'workspace')?.action).toBe('rename')
      // Le compte a son mot de passe : aucun e-mail de bienvenue à préparer.
      expect(preview.ownerInvitation).toBeNull()
    })

    it('déclare ce qui n’est PAS couvert par la transaction', async () => {
      const preview = await service.previewProvisioning(input())
      expect(preview.steps.find(s => s.key === 'owner')?.transactional).toBe(false)
      expect(preview.steps.find(s => s.key === 'invitations')?.transactional).toBe(false)
      expect(preview.steps.filter(s => s.transactional).map(s => s.key)).toEqual([
        'workspace',
        'plan',
        'credits',
        'billing',
      ])
      expect(preview.compensations.length).toBeGreaterThan(0)
    })
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * L'ENVELOPPE INITIALE (étape 4) ET L'E-MAIL PRÉPARÉ (règle 2)
   * ═══════════════════════════════════════════════════════════════════════════
   */
  describe('créditer et prévenir', () => {
    it('inscrit l’enveloppe initiale au grand livre — le solde est un état, pas une histoire', async () => {
      await service.provisionClient(input())

      expect(creditLedger.insert).toHaveBeenCalledWith([
        expect.objectContaining({
          owner_user_id: OWNER_ID,
          workspace_id: WORKSPACE_ID,
          kind: 'grant_plan',
          resource: 'analysis_slot',
          delta: 600,
          // L'opérateur du back-office n'est PAS un membre de cet espace.
          actor_user_id: null,
        }),
      ])
    })

    it('n’inscrit pas une ligne à zéro — « aucun crédit » n’est pas un mouvement', async () => {
      await service.provisionClient(input({ accountsLimit: 0, enrichmentCredits: 0 }))
      expect(creditLedger.insert).not.toHaveBeenCalled()
    })

    it('prépare l’e-mail du propriétaire avec SON lien, sans l’envoyer', async () => {
      const result = await service.provisionClient(input())

      expect(generateResetLink).toHaveBeenCalledWith(OWNER_ID)
      expect(result.ownerInvitation?.email.carriesLink).toBe(true)
      expect(result.ownerInvitation?.email.body).toContain('reset-password')
      expect(result.ownerInvitation?.email.subject).toContain('Skaizen')
      expect(result.ownerInvitation?.error).toBeNull()
    })

    it('un lien introuvable ne casse PAS le client — il est signalé, pas maquillé', async () => {
      generateResetLink.mockRejectedValue(new Error('Génération du lien impossible : rate limited.'))

      const result = await service.provisionClient(input())

      expect(result.workspaceId).toBe(WORKSPACE_ID)
      expect(result.ownerInvitation?.link).toBeNull()
      expect(result.ownerInvitation?.email.carriesLink).toBe(false)
      expect(result.ownerInvitation?.error).toContain('rate limited')
    })

    it('aucun e-mail à préparer quand le compte existait déjà', async () => {
      profiles.findOne.mockResolvedValue({ user_id: OWNER_ID, email: 'theo@skaizen.fr' } as ProfileEntity)
      workspaces.findOne.mockResolvedValue({ id: WORKSPACE_ID, owner_user_id: OWNER_ID } as WorkspaceEntity)

      const result = await service.provisionClient(input())
      expect(result.ownerInvitation).toBeNull()
      expect(generateResetLink).not.toHaveBeenCalled()
      // Rien à persister non plus : aucune invitation n'a été préparée (#2643.2).
      expect(persistOwnerActivation).not.toHaveBeenCalled()
    })

    /**
     * #2643.2 — sans cette persistance, l'écran `/esn/[id]` ne peut RIEN
     * afficher de l'activation une fois la réponse de création refermée.
     */
    it('persiste l’e-mail préparé — l’écran back-office doit pouvoir dire où en est l’activation plus tard', async () => {
      await service.provisionClient(input())

      expect(persistOwnerActivation).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: WORKSPACE_ID,
          userId: OWNER_ID,
          email: 'theo@skaizen.fr',
          ownerFirstName: 'Théo',
          esnName: 'Skaizen',
          link: expect.stringContaining('reset-password'),
          error: null,
        }),
      )
    })

    it('persiste aussi un lien introuvable — l’écran doit pouvoir dire pourquoi, pas seulement que ça a raté', async () => {
      generateResetLink.mockRejectedValue(new Error('Génération du lien impossible : rate limited.'))

      await service.provisionClient(input())

      expect(persistOwnerActivation).toHaveBeenCalledWith(
        expect.objectContaining({ link: null, error: expect.stringContaining('rate limited') }),
      )
    })

    /**
     * #2643.1 — LE TEST QUI COMPTE LE PLUS DE CE LOT. Décision Louis
     * 20/09/2026 : « l'envoi garde un geste opérateur ». Un provisionnement
     * raté préparerait quand même l'e-mail (`.link`/`.error`) ; s'il appelait
     * aussi `send`, un vrai client recevrait un e-mail depuis un espace
     * peut-être jamais réellement créé. Casser ce test exprès (appeler
     * `this.ownerActivation.send(...)` depuis `provisionClient`) le fait
     * rougir — remis, il repasse au vert.
     */
    it('N’ENVOIE JAMAIS l’e-mail d’activation elle-même — aucun e-mail ne part sans le clic opérateur', async () => {
      await service.provisionClient(input())
      expect(sendOwnerActivation).not.toHaveBeenCalled()
    })
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * LE JOURNAL (règle 4 · T3) — le contrat avec #1666
   * ═══════════════════════════════════════════════════════════════════════════
   */
  describe('journalisation avec son auteur', () => {
    const actor = { email: 'louis@bellum-it.com', role: 'owner' as const }

    it('T3 — l’opération porte son auteur, son espace et ses six étapes', async () => {
      const result = await service.provisionClient(input({ actor }))

      expect(result.audit).toMatchObject({
        event: 'client.provisioned',
        actor,
        workspaceId: WORKSPACE_ID,
        workspaceName: 'Skaizen',
        ownerEmail: 'theo@skaizen.fr',
        ownerCreated: true,
        plan: 'team',
        amountCents: 259000,
      })
      expect(result.audit.steps).toHaveLength(6)
      expect(result.audit.steps.every(s => s.outcome === 'done')).toBe(true)
      expect(Date.parse(result.audit.at)).not.toBeNaN()
    })

    it('un échec est journalisé AUSSI, avec ce qui reste à nettoyer', async () => {
      terms.save.mockRejectedValue(partieSansReponseSql())

      await expect(service.provisionClient(input({ actor }))).rejects.toBeInstanceOf(BadRequestException)

      const journalise = logJournal.mock.calls.find(call => String(call[0]).includes('client.provision_failed'))
      expect(journalise).toBeDefined()
      const meta = journalise?.[1] as { audit: { manualCleanup: string[]; actor: unknown } }
      expect(meta.audit.actor).toEqual(actor)
      expect(meta.audit.manualCleanup.length).toBeGreaterThan(0)
    })

    it('sans identité d’opérateur, le journal écrit `null` — jamais un nom deviné', async () => {
      const result = await service.provisionClient(input())
      // `DM_ALLOWED_EMAILS` absente = couche inerte : personne à nommer, et
      // c'est un FAIT, pas un trou qu'on remplirait par « admin ».
      expect(result.audit.actor).toBeNull()
    })

    function partieSansReponseSql() {
      return Object.assign(new Error('fetch failed'), { cause: { code: 'ETIMEDOUT' } })
    }
  })

  /**
   * Le calendrier de facturation (#1653), branché de bout en bout.
   *
   * `manual-billing-calendar.spec.ts` prouve la DÉRIVATION ; ce bloc prouve que
   * quelqu'un l'APPELLE, avec les vraies colonnes des vraies tables. C'est le
   * défaut n°1 de ce dépôt — du code juste, calculé, testé, que personne
   * n'appelle — et une dérivation sans appelant en serait une de plus.
   *
   * L'horloge est FIGÉE : ce chemin lit `localDayKey(new Date())`, et sans
   * horloge fixe le nombre de périodes d'un contrat de 2019 changerait tous
   * les mois.
   */
  describe('listBillingCalendar (#1653)', () => {
    beforeEach(() => jest.useFakeTimers({ now: new Date('2026-09-07T10:00:00.000Z') }))
    afterEach(() => jest.useRealTimers())

    const termsRow = (over: Record<string, unknown> = {}) => ({
      id: 'terms-1',
      workspace_id: WORKSPACE_ID,
      amount_cents: 19_900,
      currency: 'EUR',
      period: 'monthly',
      start_date: '2019-01-01',
      commitment_months: null,
      billed_to_name: null,
      billed_to_kind: null,
      billing_email: null,
      billing_phone: null,
      reference: null,
      notes: null,
      ...over,
    })

    it('rend une grille de douze mois, ancrée sur le mois courant', async () => {
      terms.find.mockResolvedValue([termsRow()])
      workspaces.find.mockResolvedValue([{ id: WORKSPACE_ID, name: 'Skaizen' }])
      invoices.find.mockResolvedValue([])

      const calendar = await service.listBillingCalendar()

      expect(calendar.months).toHaveLength(12)
      expect(calendar.anchorMonth).toBe('2026-09')
      expect(calendar.currentMonth).toBe('2026-09')
      expect(calendar.rows).toHaveLength(1)
      expect(calendar.rows[0]?.workspaceName).toBe('Skaizen')
    })

    it('LA PRÉMISSE CORRIGÉE — un contrat de 2019 rend ses 93 périodes, pas 20', async () => {
      // #1653 demandait « 20 périodes maximum, pas 80 ». Le module dit
      // MAX_PERIODS = 240 ; tronquer casserait tout contrat de plus d'un an et
      // demi. Ce que l'issue voulait borner, c'est l'AFFICHAGE — douze mois.
      terms.find.mockResolvedValue([termsRow()])
      workspaces.find.mockResolvedValue([{ id: WORKSPACE_ID, name: 'Skaizen' }])
      invoices.find.mockResolvedValue([])

      const calendar = await service.listBillingCalendar()

      expect(calendar.rows[0]?.periodsTotal).toBe(93)
      expect(calendar.rows[0]?.cells).toHaveLength(12)
      expect(calendar.earliestPeriodMonth).toBe('2019-01')
    })

    it('lit le journal des factures — une période encaissée n’est pas « à émettre »', async () => {
      terms.find.mockResolvedValue([termsRow({ start_date: '2026-01-01' })])
      workspaces.find.mockResolvedValue([{ id: WORKSPACE_ID, name: 'Skaizen' }])
      invoices.find.mockResolvedValue([
        {
          id: 'inv-1',
          workspace_id: WORKSPACE_ID,
          reference: 'F-2026-009',
          amount_cents: 19_900,
          currency: 'EUR',
          period_start: '2026-09-01',
          period_end: '2026-09-30',
          issued_on: null,
          payment_status: 'paid',
          paid_on: null,
          notes: null,
        },
      ])

      const septembre = (await service.listBillingCalendar()).rows[0]?.cells.find(cell => cell.month === '2026-09')
      expect(septembre).toMatchObject({ state: 'paid', reference: 'F-2026-009', invoiceAmountCents: 19_900 })
    })

    it('ne fait sortir AUCUNE coordonnée du client — un calendrier n’a pas à les porter', async () => {
      terms.find.mockResolvedValue([
        termsRow({ billing_email: 'compta@skaizen.fr', billing_phone: '+33600000000', notes: 'à relancer' }),
      ])
      workspaces.find.mockResolvedValue([{ id: WORKSPACE_ID, name: 'Skaizen' }])
      invoices.find.mockResolvedValue([])

      const payload = JSON.stringify(await service.listBillingCalendar())
      expect(payload).not.toContain('compta@skaizen.fr')
      expect(payload).not.toContain('+33600000000')
      expect(payload).not.toContain('à relancer')
    })

    it('aucun contrat : une grille vide, jamais une borne inventée', async () => {
      terms.find.mockResolvedValue([])

      const calendar = await service.listBillingCalendar()
      expect(calendar.rows).toEqual([])
      expect(calendar.earliestPeriodMonth).toBeNull()
      expect(calendar.months).toHaveLength(12)
      // Rien n'est allé chercher des espaces ni des factures pour zéro contrat.
      expect(workspaces.find).not.toHaveBeenCalled()
    })
  })

  /* ───────────────────────── LA RELANCE (#1655) ───────────────────────── */
  describe('la relance d’une période en retard', () => {
    /**
     * ⚠️ Les dates sont RELATIVES à aujourd'hui, jamais littérales : le service
     * lit l'horloge locale (`localDayKey`), et un littéral daté ferait passer ce
     * test à Paris pour le faire échouer en CI, ou l'inverse six mois plus tard.
     * Le décalage de soixante jours place l'échéance dérivée
     * (`period_start` + 30) exactement trente jours en arrière.
     */
    const AUJOURDHUI = localDayKey(new Date())
    const DEBUT = addDays(AUJOURDHUI, -60)

    const termsRow = (over: Record<string, unknown> = {}) => ({
      id: 'terms-1',
      workspace_id: WORKSPACE_ID,
      amount_cents: 119_000,
      currency: 'EUR',
      period: 'monthly',
      start_date: DEBUT,
      commitment_months: null,
      billed_to_name: null,
      billed_to_kind: null,
      billing_email: 'compta@skaizen.fr',
      billing_phone: null,
      reference: null,
      notes: null,
      ...over,
    })

    const invoiceRow = (over: Record<string, unknown> = {}) => ({
      id: 'inv-1',
      workspace_id: WORKSPACE_ID,
      reference: 'F-2026-0142',
      amount_cents: 119_000,
      currency: 'EUR',
      period_start: DEBUT,
      period_end: addDays(DEBUT, 29),
      issued_on: null,
      payment_status: 'unpaid',
      paid_on: null,
      notes: null,
      disputed_at: null,
      dispute_reason: null,
      dispute_resolved_at: null,
      reminders: [],
      ...over,
    })

    beforeEach(() => {
      workspaces.findOne.mockResolvedValue({ id: WORKSPACE_ID, name: 'Skaizen' })
      terms.findOne.mockResolvedValue(termsRow())
      invoices.find.mockResolvedValue([invoiceRow()])
    })

    it('prépare la relance de la période, avec le montant et la référence de la FACTURE', async () => {
      const vue = await service.prepareInvoiceReminder(WORKSPACE_ID, DEBUT)
      expect(vue.window.start).toBe(DEBUT)
      expect(vue.reminder.prepared).toBe(true)
      if (!vue.reminder.prepared) return
      expect(vue.reminder).toMatchObject({ index: 1, tone: 'neutral', invoiceId: 'inv-1' })
      expect(vue.reminder.subject).toContain('F-2026-0142')
      expect(vue.reminder.recipientEmail).toBe('compta@skaizen.fr')
    })

    it('⚠️ facture marquée en litige → AUCUNE relance proposée (le test de #1655)', async () => {
      invoices.find.mockResolvedValue([
        invoiceRow({ disputed_at: new Date(), dispute_reason: 'Deux jours contestés sur juin' }),
      ])

      const vue = await service.prepareInvoiceReminder(WORKSPACE_ID, DEBUT)
      expect(vue.reminder.prepared).toBe(false)
      if (vue.reminder.prepared) return
      expect(vue.reminder.reason).toBe('dispute_open')
      // Le refus PORTE le motif ET la facture : l'écran doit pouvoir dire
      // pourquoi, et offrir le geste inverse sans redemander l'identifiant.
      expect(vue.reminder.disputeReason).toBe('Deux jours contestés sur juin')
      expect(vue.reminder.invoiceId).toBe('inv-1')
    })

    it('une période inconnue du contrat ne s’invente pas', async () => {
      await expect(service.prepareInvoiceReminder(WORKSPACE_ID, '2019-01-01')).rejects.toThrow(NotFoundException)
    })

    it('consigner une relance écrit sa DATE et son AUTEUR sur la facture', async () => {
      invoices.findOne.mockResolvedValue(invoiceRow())

      const ligne = await service.logInvoiceReminder('inv-1', { tone: 'neutral', actor: 'louis@bellum-it.com' })
      expect(ligne.reminders).toHaveLength(1)
      expect(ligne.reminders[0]).toMatchObject({ by: 'louis@bellum-it.com', tone: 'neutral', index: 1 })
      expect(ligne.reminders[0]?.at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })

    it('⚠️ la PORTE est aussi large que le flux — consigner refuse ce que l’écran refuse', async () => {
      // Le défaut symétrique que ce dépôt connaît : l'écran dit « suspendu », et
      // l'appel direct consigne quand même, si bien que le compteur avance sur
      // une facture contestée.
      const contestee = invoiceRow({ disputed_at: new Date(), dispute_reason: 'litige' })
      invoices.findOne.mockResolvedValue(contestee)
      invoices.find.mockResolvedValue([contestee])

      await expect(service.logInvoiceReminder('inv-1', { tone: 'firm', actor: 'louis@bellum-it.com' })).rejects.toThrow(
        BadRequestException,
      )
      expect(invoices.save).not.toHaveBeenCalled()
    })

    it('une relance sans auteur ne se consigne pas — « quelqu’un » n’est pas une trace', async () => {
      invoices.findOne.mockResolvedValue(invoiceRow())
      await expect(service.logInvoiceReminder('inv-1', { tone: 'neutral', actor: '   ' })).rejects.toThrow(
        BadRequestException,
      )
    })

    it('déclarer un litige exige son motif, et le lever garde la trace de la déclaration', async () => {
      const facture = invoiceRow()
      invoices.findOne.mockResolvedValue(facture)

      await expect(service.setInvoiceDispute('inv-1', {})).rejects.toThrow(BadRequestException)

      const declare = await service.setInvoiceDispute('inv-1', { reason: 'Prestation contestée' })
      expect(declare.disputedAt).not.toBeNull()
      expect(declare.disputeReason).toBe('Prestation contestée')
      expect(declare.disputeResolvedAt).toBeNull()

      const leve = await service.setInvoiceDispute('inv-1', { resolve: true })
      // On archive, on ne supprime pas : la déclaration reste, c'est elle qui
      // explique le retard de paiement.
      expect(leve.disputedAt).not.toBeNull()
      expect(leve.disputeResolvedAt).not.toBeNull()
    })

    it('lever un litige qui n’a jamais été déclaré n’a pas de sens', async () => {
      invoices.findOne.mockResolvedValue(invoiceRow())
      await expect(service.setInvoiceDispute('inv-1', { resolve: true })).rejects.toThrow(BadRequestException)
    })

    it('⚠️ RIEN N’EST ENVOYÉ — aucun transport n’est sollicité par le chemin de la relance', async () => {
      // La preuve à l'EXÉCUTION, en plus de la preuve statique
      // (`manual-billing-reminder-no-send.spec.ts`) : le seul collaborateur du
      // service capable de faire partir un e-mail est celui des invitations, et
      // il n'est jamais touché.
      invoices.findOne.mockResolvedValue(invoiceRow())
      await service.prepareInvoiceReminder(WORKSPACE_ID, DEBUT)
      await service.logInvoiceReminder('inv-1', { tone: 'neutral', actor: 'louis@bellum-it.com' })
      await service.setInvoiceDispute('inv-1', { reason: 'contesté' })
      expect(createInvitationWithDelivery).not.toHaveBeenCalled()
    })
  })
})
