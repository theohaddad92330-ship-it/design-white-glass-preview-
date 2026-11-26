import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import { DataSource, In, Repository, type EntityManager } from 'typeorm'
import type { ReminderTone, WorkspaceRole } from '@bellum/contracts'
import { localDayKey } from '@bellum/contracts'
import { CreditLedgerEntity } from '../../database/entities/credit-ledger.entity'
import { ManualBillingInvoiceEntity } from '../../database/entities/manual-billing-invoice.entity'
import type { ManualInvoicePaymentStatus } from '../../database/entities/manual-billing-invoice.entity'
import { ManualBillingTermsEntity } from '../../database/entities/manual-billing-terms.entity'
import type {
  ManualBillingBilledToKind,
  ManualBillingPeriod,
} from '../../database/entities/manual-billing-terms.entity'
import { asDay } from '../../common/day'
import { buildBillingCalendar, type BillingCalendar } from './manual-billing-calendar'
import {
  BILLING_REMINDER_LOGGED_EVENT,
  prepareReminder,
  type InvoiceForReminder,
  type LoggedReminder,
  type PreparedReminder,
  type ReminderRefusal,
} from './manual-billing-reminder'
import {
  addDays,
  addMonths,
  billingHealth,
  commitmentEndOf,
  covers,
  windowsUntil,
  type BillingHealth,
  type InvoiceForSchedule,
} from './manual-billing-schedule'
import {
  buildProvisioningPreview,
  periodEndOf,
  renderOwnerInvitationEmail,
  type PreparedEmail,
  type ProvisioningAuditEntry,
  type ProvisioningStepOutcome,
  type ProvisioningPreview,
} from './manual-provisioning-plan'
import {
  buildFailureReport,
  decideCompensation,
  outcomeOfFailure,
  type WriteOutcome,
} from './manual-provisioning-compensation'
import { AdminUsersService } from './admin-users.service'
import { OwnerActivationService } from './owner-activation.service'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { SubscriptionEntity } from '../../database/entities/subscription.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { SupabaseService } from '../../supabase/supabase.service'
import { PlanCatalogService } from '../credits/plan-catalog.service'
import type { PlanKey } from '../credits/plan-catalog.defaults'
import { WorkspaceTeamService } from '../workspace/workspace-team.service'

/** A manual client is a PAID client. `trial` is excluded on purpose: trial rows
 *  are skipped by the monthly quota reset (a trial expires, it does not roll),
 *  so provisioning one would hand the client a pool that never refills. */
type ManualPlanKey = Exclude<PlanKey, 'trial'>

/** Roles an operator may hand out at provisioning time — the same set the
 *  invitation contract accepts (`owner` is never invitable). */
type InvitableRole = Exclude<WorkspaceRole, 'owner'>

export interface ProvisionClientInput {
  /** The ESN's name — becomes the workspace name. */
  esnName: string
  owner: { email: string; firstName?: string; lastName?: string }
  plan: ManualPlanKey
  /** Seats beyond the plan's included allowance (the +29€/seat add-on, granted
   *  here rather than sold through Stripe). */
  extraSeats?: number
  /** Negotiated analyses/month. Defaults to the plan catalog value. */
  accountsLimit?: number
  /** Negotiated enrichment credits/month. Defaults to the plan catalog value. */
  enrichmentCredits?: number
  billing: {
    amountCents: number
    currency?: string
    period: ManualBillingPeriod
    /** `YYYY-MM-DD`. */
    startDate: string
    /** Contract length in months. Absent = no commitment agreed — never 0. */
    commitmentMonths?: number
    /** Who the invoice is made out to, when it is not simply the ESN. */
    billedToName?: string
    billedToKind?: ManualBillingBilledToKind
    billingEmail?: string
    billingPhone?: string
    /** Whether the FIRST invoice is already cashed in. It lands on the invoice
     *  row, not on the terms — the terms describe the contract, not a payment. */
    paymentStatus?: ManualInvoicePaymentStatus
    /** The first invoice's number. Given one, the ledger opens with its row. */
    reference?: string
    notes?: string
  }
  /** `owner` is excluded — it belongs to the account holder, set by the
   *  provisioning itself, and is what the invitation contract allows. */
  team?: Array<{ email: string; role: InvitableRole }>
  /**
   * L'opérateur qui déclenche l'opération (#1665, règle 4 : « journalisée avec
   * son auteur »).
   *
   * ⚠️ PRÉMISSE CORRIGÉE. L'API ne pouvait PAS journaliser un auteur : elle est
   * gardée par un SECRET PARTAGÉ (`InternalSecretGuard`), pas par une identité,
   * et `adminMutate` ne transmettait rien de l'opérateur. « Journaliser avec son
   * auteur » exigeait donc d'abord de faire VOYAGER l'auteur — c'est ce que ce
   * champ fait, rempli côté back-office par `operateurDeLaRequete` (la session
   * signée relue, jamais un en-tête que le navigateur pourrait écrire).
   *
   * Optionnel, et ça se lit : sans `DM_ALLOWED_EMAILS`, la couche d'identité du
   * back-office est INERTE et il n'y a personne à nommer. Le journal écrit alors
   * `actor: null`, ce qui est vrai, plutôt qu'un nom deviné.
   */
  actor?: { email: string; role: string }
}

interface ProvisionedInvitation {
  email: string
  role: string
  /** The invitation row was persisted. */
  created: boolean
  /** The invitation email actually left the transport. */
  emailSent: boolean
  error: string | null
}

export interface ProvisionClientResult {
  workspaceId: string
  workspaceName: string
  owner: {
    userId: string
    email: string
    /** False when an existing account was reused (idempotent re-provisioning). */
    created: boolean
  }
  plan: string
  accountsLimit: number
  enrichmentCredits: number
  extraSeats: number
  seatsTotal: number
  billingMode: 'manual'
  terms: {
    amountCents: number
    currency: string
    period: ManualBillingPeriod
    startDate: string
    /** `null` = no commitment agreed. The operator UI must print « non
     *  renseigné », never « 0 mois ». */
    commitmentMonths: number | null
    /** Derived from the two above — see `commitmentEndOf`. `null` without a
     *  commitment: no end date is invented. */
    commitmentEnd: string | null
    reference: string | null
  }
  /** The first invoice, when a reference was given. `null` when the operator
   *  had none yet — the ledger then starts empty, and the first period will
   *  legitimately show up as missing an invoice. */
  firstInvoice: { reference: string; periodStart: string; periodEnd: string; paid: boolean } | null
  invitations: ProvisionedInvitation[]
  /**
   * True only when EVERY notification that was supposed to leave, left. The
   * operator UI keys its success/warning state off this — a workspace exists
   * either way, but "provisioned" and "the client knows" are different facts.
   */
  fullyNotified: boolean
  /**
   * Whether the newly created owner still has to set their own credentials.
   * We never mint a password on a human's behalf; the operator sends them the
   * reset link via the existing `POST internal/admin/users/:id/reset-link`.
   */
  ownerNeedsCredentials: boolean
  /**
   * L'e-mail du propriétaire, PRÉPARÉ avec son lien de définition de mot de
   * passe, prêt à être relu puis envoyé (#1665, règle 2 : « pas d'envoi
   * silencieux »). `null` quand le compte existait déjà : il a son mot de passe.
   *
   * ⚠️ CE QUE CE CHAMP N'EST PAS : un envoi. Le lien est engendré par
   * `AdminUsersService.generateResetLink` — LA construction du dépôt, jamais une
   * seconde — et rendu à l'opérateur, qui l'envoie. Envoyer d'ici demanderait
   * `MailerModule` dans `AdminModule` ; ce fichier-là n'appartient pas à ce lot.
   */
  ownerInvitation: OwnerInvitation | null
  /**
   * Ce qui a été journalisé, tel quel — le contrat avec #1666. Rendu à
   * l'appelant pour que le back-office affiche « créé par toi, à telle heure »
   * sans avoir à le redériver.
   */
  audit: ProvisioningAuditEntry
}

/** L'e-mail de bienvenue du propriétaire, avec son lien à usage unique. */
interface OwnerInvitation {
  /** Le message prêt à copier : destinataire, objet, corps. */
  email: PreparedEmail
  /** `null` quand le lien n'a pas pu être engendré — `error` dit pourquoi. */
  link: string | null
  expiresAt: string | null
  /** `null` quand tout va bien. Jamais un succès affiché sur un lien absent. */
  error: string | null
}

/** One emitted invoice, as the backoffice lists it. */
export interface ManualInvoiceRow {
  id: string
  reference: string
  amountCents: number
  currency: string
  periodStart: string
  periodEnd: string
  issuedOn: string | null
  paymentStatus: ManualInvoicePaymentStatus
  paidOn: string | null
  notes: string | null
  /**
   * Le LITIGE (#1655). `disputedAt` non nul et `disputeResolvedAt` nul = le
   * litige court, et la cadence de relance est suspendue. Le litige n'est pas un
   * statut de paiement : une facture contestée est aussi une facture impayée.
   */
  disputedAt: string | null
  disputeReason: string | null
  disputeResolvedAt: string | null
  /** Les relances CONSIGNÉES, de la plus ancienne à la plus récente. */
  reminders: LoggedReminder[]
}

/**
 * Ce qu'un opérateur voit quand il ouvre une période EN RETARD : la relance
 * prête à copier, ou le refus qui dit pourquoi il n'y en a pas (#1655).
 *
 * ⚠️ La préparation est une LECTURE. Rien n'est écrit, rien n'est envoyé, et
 * rien ne l'est non plus quand l'opérateur consigne : consigner dit qu'un humain
 * a envoyé le message, ce n'est pas l'envoyer.
 */
export interface ManualReminderView {
  workspaceId: string
  workspaceName: string
  /** La période concernée, telle que le module de facturation la dérive. */
  window: { start: string; end: string }
  reminder: PreparedReminder | ReminderRefusal
}

/** One invoice-billed client as the "Facturation" screen shows it. */
export interface ManualClientRow {
  workspaceId: string
  workspaceName: string
  ownerEmail: string | null
  plan: string | null
  billingMode: string | null
  amountCents: number
  currency: string
  period: ManualBillingPeriod
  startDate: string
  /** `null` = aucun engagement enregistré. Never rendered as `0`. */
  commitmentMonths: number | null
  billedToName: string | null
  billedToKind: ManualBillingBilledToKind | null
  billingEmail: string | null
  billingPhone: string | null
  reference: string | null
  notes: string | null
  /** Every invoice emitted for this client, most recent period first. */
  invoices: ManualInvoiceRow[]
  /** What is late, and by how long — the derived state the column reads. */
  health: BillingHealth
}

/**
 * Sales-led ("enterprise") client provisioning for the backoffice.
 *
 * The operator closes a deal by hand, invoices the client offline (bank
 * transfer), and sets the whole thing up here: the ESN workspace, its owner,
 * the team, the plan, the seats and the quota — with NO Stripe subscription at
 * any point.
 *
 * Built ON the existing model, not beside it:
 *  - the owner is a normal Supabase auth user (the `on_auth_user_created_*`
 *    triggers seed their profile / workspace / subscription exactly as on
 *    self-signup);
 *  - the team is invited through {@link WorkspaceTeamService}, so seat caps,
 *    invite dedupe, token TTL and the mailer are the ones already in
 *    production;
 *  - entitlement stays on `subscriptions` (plan + quotas), flagged
 *    `billing_mode = 'manual'` so no billing job mistakes an invoice-billed
 *    client for a lapsed one.
 *
 * What it deliberately does NOT do: set anybody's password, create a Stripe
 * customer, generate an invoice document, or chase a payment.
 */
@Injectable()
export class ManualProvisioningService {
  private readonly logger = new Logger(ManualProvisioningService.name)

  constructor(
    @InjectRepository(ProfileEntity)
    private readonly profiles: Repository<ProfileEntity>,
    @InjectRepository(SubscriptionEntity)
    private readonly subscriptions: Repository<SubscriptionEntity>,
    @InjectRepository(WorkspaceEntity)
    private readonly workspaces: Repository<WorkspaceEntity>,
    @InjectRepository(WorkspaceMemberEntity)
    private readonly members: Repository<WorkspaceMemberEntity>,
    @InjectRepository(ManualBillingTermsEntity)
    private readonly terms: Repository<ManualBillingTermsEntity>,
    @InjectRepository(ManualBillingInvoiceEntity)
    private readonly invoices: Repository<ManualBillingInvoiceEntity>,
    @InjectRepository(CreditLedgerEntity)
    private readonly creditLedger: Repository<CreditLedgerEntity>,
    // La transaction unique de l'étape « tout ou rien ». `DataSource` est
    // fournie globalement par `TypeOrmModule.forRoot` : aucun module à modifier.
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly planCatalog: PlanCatalogService,
    private readonly supabase: SupabaseService,
    private readonly team: WorkspaceTeamService,
    // Voisin de MÊME module (`admin/`) : c'est lui qui construit LE lien de
    // réinitialisation du dépôt. En écrire un second ici, c'est le défaut que
    // son propre docblock raconte — « deux constructions divergeaient, l'une des
    // deux était fausse » — et l'opérateur remettait un lien qui ne marchait pas.
    private readonly adminUsers: AdminUsersService,
    // Persiste l'e-mail d'activation préparé ci-dessous (#2643.2) : sans lui,
    // l'écran `/esn/[id]` ne peut rien dire de l'activation une fois cette
    // réponse HTTP refermée.
    private readonly ownerActivation: OwnerActivationService,
  ) {}

  /**
   * LE RÉCAPITULATIF, avant toute écriture (#1665, règle 3 · test T2).
   *
   * ⚠️ CE QUE CETTE MÉTHODE NE FAIT PAS, ET C'EST TOUT L'INTÉRÊT : elle
   * n'écrit RIEN. Aucun `save`, aucun `insert`, aucun `createUser`. La
   * dérivation vit dans `manual-provisioning-plan.ts`, qui n'a aucun dépôt —
   * il n'y a donc rien à oublier dans une branche. Le service se contente de
   * LIRE l'état existant et de le passer.
   */
  async previewProvisioning(input: ProvisionClientInput): Promise<ProvisioningPreview> {
    const email = normaliseEmail(input.owner.email)
    const planConfig = await this.planCatalog.getOrDefault(input.plan)

    const profile = await this.profiles.findOne({ where: { email } })
    const subscription = profile ? await this.subscriptions.findOne({ where: { user_id: profile.user_id } }) : null
    const workspace = profile
      ? await this.workspaces.findOne({ where: { owner_user_id: profile.user_id }, order: { created_at: 'ASC' } })
      : null
    const terms = workspace ? await this.terms.findOne({ where: { workspace_id: workspace.id } }) : null

    const reference = input.billing.reference?.trim()
    const duplicate =
      workspace && reference
        ? await this.invoices
            .createQueryBuilder('i')
            .where('i.workspace_id = :workspaceId', { workspaceId: workspace.id })
            .andWhere('LOWER(i.reference) = LOWER(:reference)', { reference })
            .getOne()
        : null

    return buildProvisioningPreview(
      input,
      {
        ownerExists: profile !== null,
        ownerHasStripeSubscription: Boolean(subscription?.stripe_subscription_id),
        existingWorkspace: workspace ? { id: workspace.id, name: workspace.name } : null,
        existingSubscription: subscription
          ? {
              plan: subscription.plan,
              accountsLimit: subscription.accounts_limit,
              enrichmentCredits: subscription.enrichment_credits,
            }
          : null,
        existingTerms: terms !== null,
        invoiceAlreadyRecorded: duplicate !== null,
        plan: {
          label: planConfig.label,
          accountsLimit: planConfig.accounts_limit,
          enrichmentCredits: planConfig.enrichment_credits,
          seats: planConfig.seats,
        },
      },
      new Date(),
    )
  }

  /**
   * Les six étapes, en une opération — et l'ordre n'est pas celui du récit.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * CE QUI EST DANS LA TRANSACTION, ET CE QUI DEMANDE UNE COMPENSATION
   * ─────────────────────────────────────────────────────────────────────────
   *  1. Le compte du propriétaire vit dans **Supabase Auth** : aucun `ROLLBACK`
   *     ne l'atteint. Il est créé EN PREMIER (un espace porte `owner_user_id`),
   *     donc c'est lui qu'on compense si la suite échoue.
   *  2. Espace, adhésion, offre, crédits, conditions et première facture : UNE
   *     transaction SQL. C'est le T1 de l'issue — échec à l'étape 4, aucun
   *     espace, aucun utilisateur.
   *  3. Les e-mails partent APRÈS le commit. Un e-mail parti ne se dé-envoie
   *     pas : l'envoyer avant reviendrait à prévenir une équipe de l'ouverture
   *     d'un espace qu'un `ROLLBACK` va effacer.
   *
   * ⚠️ Et `unknown` arrête tout : voir `manual-provisioning-compensation.ts`.
   */
  async provisionClient(input: ProvisionClientInput): Promise<ProvisionClientResult> {
    const email = normaliseEmail(input.owner.email)
    const planConfig = await this.planCatalog.getOrDefault(input.plan)

    const { userId, created } = await this.resolveOwner(email, input.owner)

    const committed = await this.writeInOneTransaction({ userId, email, created, input })
    const { workspace, subscription, terms, firstInvoice } = committed

    const invitations = await this.inviteTeam(userId, email, input.team ?? [])
    const ownerInvitation = created
      ? await this.prepareOwnerInvitation({
          userId,
          email,
          esnName: workspace.name,
          planLabel: planConfig.label,
          input,
        })
      : null

    // #2643.2 — persisté pour que l'écran back-office puisse dire où en est
    // l'activation APRÈS que cette réponse HTTP a été refermée. Jamais
    // bloquant, au même titre que la préparation elle-même : le client existe
    // déjà, une panne d'écriture ici ne doit pas le faire disparaître.
    if (ownerInvitation) {
      try {
        await this.ownerActivation.persist({
          workspaceId: workspace.id,
          userId,
          email,
          ownerFirstName: input.owner.firstName?.trim() || null,
          esnName: workspace.name,
          planLabel: planConfig.label,
          link: ownerInvitation.link,
          expiresAt: ownerInvitation.expiresAt,
          error: ownerInvitation.error,
        })
      } catch (err) {
        this.logger.error(`Owner activation persistence failed for workspace ${workspace.id}`, {
          error: err,
          tags: { 'admin.op': 'owner_activation.persist_failed' },
        })
      }
    }

    const fullyNotified = invitations.every(inv => inv.created && inv.emailSent)

    const audit = this.emitAudit({
      event: 'client.provisioned',
      actor: input.actor ?? null,
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      ownerEmail: email,
      ownerCreated: created,
      plan: subscription.plan,
      amountCents: terms.amount_cents,
      steps: [
        { key: 'workspace', action: created ? 'create' : 'update', outcome: 'done' },
        { key: 'owner', action: created ? 'create' : 'reuse', outcome: 'done' },
        { key: 'plan', action: 'update', outcome: 'done' },
        { key: 'credits', action: 'update', outcome: 'done' },
        { key: 'billing', action: firstInvoice ? 'create' : 'update', outcome: 'done' },
        {
          key: 'invitations',
          action: invitations.length > 0 || ownerInvitation ? 'create' : 'none',
          outcome: fullyNotified ? 'done' : 'failed',
        },
      ],
      manualCleanup: [],
      at: new Date().toISOString(),
    })

    return {
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      owner: { userId, email, created },
      plan: subscription.plan,
      accountsLimit: subscription.accounts_limit,
      enrichmentCredits: subscription.enrichment_credits,
      extraSeats: subscription.extra_seats,
      seatsTotal: planConfig.seats + subscription.extra_seats,
      billingMode: 'manual',
      terms: {
        amountCents: terms.amount_cents,
        currency: terms.currency,
        period: terms.period,
        startDate: terms.start_date,
        commitmentMonths: terms.commitment_months,
        commitmentEnd: commitmentEndOf({
          period: terms.period,
          startDate: terms.start_date,
          commitmentMonths: terms.commitment_months,
        }),
        reference: terms.reference,
      },
      firstInvoice: firstInvoice
        ? {
            reference: firstInvoice.reference,
            periodStart: firstInvoice.period_start,
            periodEnd: firstInvoice.period_end,
            paid: firstInvoice.payment_status === 'paid',
          }
        : null,
      invitations,
      fullyNotified,
      ownerNeedsCredentials: created,
      ownerInvitation,
      audit,
    }
  }

  /**
   * Les quatre écritures SQL, dans UNE transaction — et la compensation de ce
   * qui vit hors d'elle quand elle échoue.
   *
   * ⚠️ Toutes les écritures passent par les dépôts du `EntityManager` de la
   * transaction, jamais par `this.*` : un seul `this.workspaces.save()` oublié
   * ici écrirait HORS transaction, ne serait pas annulé, et laisserait
   * exactement l'espace orphelin que ce lot supprime. C'est ce que la garde
   * « toutes les écritures ont lieu la transaction OUVERTE » du spec mesure.
   */
  private async writeInOneTransaction(ctx: {
    userId: string
    email: string
    created: boolean
    input: ProvisionClientInput
  }): Promise<CommittedProvisioning> {
    try {
      return await this.dataSource.transaction(async (manager: EntityManager) => {
        const repos = reposOf(manager)
        const workspace = await this.resolveWorkspace(repos, ctx.userId, ctx.input.esnName.trim())
        const subscription = await this.writeManualSubscription(repos, ctx.userId, ctx.input)
        await this.openCreditEnvelope(repos, ctx.userId, workspace.id, subscription, ctx.input.plan)
        const terms = await this.writeTerms(repos, workspace.id, ctx.input.billing)
        const firstInvoice = await this.openLedger(repos, workspace.id, ctx.input.billing)
        return { workspace, subscription, terms, firstInvoice }
      })
    } catch (error) {
      return this.compensate(ctx, error)
    }
  }

  /**
   * Ce qu'on défait quand la transaction a échoué — et ce qu'on refuse de
   * défaire. La décision est PURE (`decideCompensation`) ; ici on ne fait que
   * l'exécuter et rapporter honnêtement ce qu'il en est advenu.
   */
  private async compensate(
    ctx: { userId: string; email: string; created: boolean; input: ProvisionClientInput },
    error: unknown,
  ): Promise<never> {
    const sqlOutcome: WriteOutcome = outcomeOfFailure(error)
    const decision = decideCompensation({
      ownerAccountCreatedHere: ctx.created,
      ownerUserId: ctx.userId,
      sqlOutcome,
    })

    let compensationOutcome: WriteOutcome | null = null
    if (decision.action === 'delete_owner_account') {
      compensationOutcome = await this.deleteAuthUser(decision.userId)
    }

    const cause = error instanceof Error ? error.message : String(error)
    const report = buildFailureReport({
      cause: `Provisionnement interrompu : ${cause}.`,
      decision,
      compensationOutcome,
      ownerEmail: ctx.email,
    })

    /*
     * ⚠️ L'issue de chaque étape est ÉCRITE, pas devinée — et « on ne sait pas »
     * est une issue à part entière.
     *
     *  · Les étapes SQL : `failed` quand la transaction a été annulée sans
     *    ambiguïté, `unknown` quand elle est partie sans réponse (elle a
     *    peut-être été commise, et le journal ne doit pas affirmer le contraire).
     *  · Le PROPRIÉTAIRE : `skipped` s'il préexistait — rien ne lui a été fait ;
     *    `failed` si le compte qu'on venait de créer a bien été supprimé ;
     *    `unknown` dès que la suppression n'a pas abouti franchement.
     */
    const sqlStep: ProvisioningStepOutcome = sqlOutcome === 'unknown' ? 'unknown' : 'failed'
    const ownerStep: ProvisioningStepOutcome = !ctx.created
      ? 'skipped'
      : decision.action === 'delete_owner_account' && compensationOutcome === 'done'
        ? 'failed'
        : 'unknown'

    this.emitAudit({
      event: 'client.provision_failed',
      actor: ctx.input.actor ?? null,
      workspaceId: null,
      workspaceName: ctx.input.esnName.trim(),
      ownerEmail: ctx.email,
      ownerCreated: ctx.created,
      plan: ctx.input.plan,
      amountCents: ctx.input.billing.amountCents,
      steps: [
        { key: 'workspace', action: 'create', outcome: sqlStep },
        { key: 'owner', action: ctx.created ? 'create' : 'reuse', outcome: ownerStep },
        { key: 'plan', action: 'update', outcome: sqlStep },
        { key: 'credits', action: 'update', outcome: sqlStep },
        { key: 'billing', action: 'create', outcome: sqlStep },
        { key: 'invitations', action: 'none', outcome: 'skipped' },
      ],
      manualCleanup: report.manualCleanup,
      at: new Date().toISOString(),
    })

    this.logger.error(`Manual provisioning rolled back for ${ctx.email}`, {
      error,
      tags: { 'admin.op': 'client.provision', 'admin.provision.outcome': sqlOutcome },
    })

    throw new BadRequestException(report.message)
  }

  /**
   * Supprime le compte d'authentification créé à l'instant.
   *
   * ⚠️ L'ISSUE DE CETTE SUPPRESSION COMPTE AUTANT QUE CELLE DE LA CRÉATION. Un
   * `DELETE` parti sans réponse a peut-être abouti : le rapport dira « peut-être
   * supprimé », jamais « annulé ». Rejouer serait le geste dangereux.
   */
  private async deleteAuthUser(userId: string): Promise<WriteOutcome> {
    try {
      const { error } = await this.supabase.getClient().auth.admin.deleteUser(userId)
      // Une réponse — fût-ce un refus — prouve que le distant a traité la
      // demande : c'est un échec net, pas une incertitude.
      return error ? 'failed' : 'done'
    } catch (err) {
      return outcomeOfFailure(err)
    }
  }

  /**
   * L'e-mail du propriétaire, prêt à partir mais PAS parti (#1665, règle 2).
   *
   * Jamais bloquant : le client existe, la transaction est commise. Un lien
   * qu'on n'a pas pu engendrer se rattrape depuis la fiche utilisateur — perdre
   * l'espace pour ça serait absurde.
   */
  private async prepareOwnerInvitation(ctx: {
    userId: string
    email: string
    esnName: string
    planLabel: string
    input: ProvisionClientInput
  }): Promise<OwnerInvitation> {
    const render = (link: string | null, expiresAt: string | null): PreparedEmail =>
      renderOwnerInvitationEmail({
        ownerEmail: ctx.email,
        ownerFirstName: ctx.input.owner.firstName,
        esnName: ctx.esnName,
        planLabel: ctx.planLabel,
        link,
        expiresAt,
      })

    try {
      const { link, expiresAt } = await this.adminUsers.generateResetLink(ctx.userId)
      return { email: render(link, expiresAt), link, expiresAt, error: null }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger.warn(`Manual provisioning: owner reset link failed for ${ctx.email} (${message})`)
      // Le message est rendu SANS lien : montrer un corps « prêt à envoyer » qui
      // porterait un emplacement à la place du lien ferait envoyer un e-mail
      // inutilisable, ce qui est pire que de dire « lien indisponible ».
      return { email: render(null, null), link: null, expiresAt: null, error: message }
    }
  }

  /**
   * L'ÉMISSION UNIQUE de l'événement d'audit — le contrat avec #1666.
   *
   * Une seule ligne d'appel dans tout le service, pour que #1666 n'ait qu'un
   * endroit où brancher son écriture. Le journal structuré (Winston → Sentry)
   * est le mécanisme EXISTANT le plus proche : le journal d'ACCÈS
   * (`backoffice_access_events`) refuse explicitement ce rôle — « séparé du
   * journal d'actions (#1666) », dit son entité — et en poser un second serait
   * exactement la table de trop.
   */
  private emitAudit(entry: ProvisioningAuditEntry): ProvisioningAuditEntry {
    this.logger.log(
      `[audit] ${entry.event} ${entry.workspaceName} par ${entry.actor?.email ?? 'opérateur non identifié'}`,
      {
        tags: { 'admin.op': 'client.provision', 'admin.audit.event': entry.event },
        audit: entry,
      },
    )
    return entry
  }

  /**
   * Every invoice-billed client, for the "Facturation" screen. Joins the terms
   * to their workspace + owner so the operator can see, in one place, who owes
   * what — the app itself never chases a payment.
   */
  async listManualClients(): Promise<ManualClientRow[]> {
    const rows = await this.terms.find({ order: { start_date: 'DESC' } })
    if (rows.length === 0) return []

    const workspaceIds = rows.map(r => r.workspace_id)
    const workspaces = await this.workspaces.find({ where: { id: In(workspaceIds) } })
    const byId = new Map(workspaces.map(w => [w.id, w]))

    const ownerIds = workspaces.map(w => w.owner_user_id)
    const [owners, subs] = await Promise.all([
      ownerIds.length ? this.profiles.find({ where: { user_id: In(ownerIds) } }) : Promise.resolve([]),
      ownerIds.length ? this.subscriptions.find({ where: { user_id: In(ownerIds) } }) : Promise.resolve([]),
    ])
    const ownerById = new Map(owners.map(p => [p.user_id, p]))
    const subByUser = new Map(subs.map(s => [s.user_id, s]))

    const ledger = await this.invoices.find({
      where: { workspace_id: In(workspaceIds) },
      order: { period_start: 'DESC' },
    })
    const ledgerByWorkspace = new Map<string, ManualBillingInvoiceEntity[]>()
    for (const invoice of ledger) {
      const bucket = ledgerByWorkspace.get(invoice.workspace_id)
      if (bucket) bucket.push(invoice)
      else ledgerByWorkspace.set(invoice.workspace_id, [invoice])
    }

    // UN seul « aujourd'hui » pour toute la liste : deux appels d'horloge dans
    // une boucle peuvent tomber de part et d'autre de minuit, et deux clients
    // seraient alors mesurés sur des jours différents. Lu sur l'horloge locale
    // (GA-126) — `toISOString()` recule d'un jour deux heures par nuit à Paris.
    const today = localDayKey(new Date())

    return rows.map(row => {
      const workspace = byId.get(row.workspace_id)
      const sub = workspace ? subByUser.get(workspace.owner_user_id) : undefined
      const invoices = ledgerByWorkspace.get(row.workspace_id) ?? []
      return {
        workspaceId: row.workspace_id,
        workspaceName: workspace?.name ?? '(espace supprimé)',
        ownerEmail: workspace ? (ownerById.get(workspace.owner_user_id)?.email ?? null) : null,
        plan: sub?.plan ?? null,
        billingMode: sub?.billing_mode ?? null,
        amountCents: row.amount_cents,
        currency: row.currency,
        period: row.period,
        startDate: row.start_date,
        commitmentMonths: row.commitment_months,
        billedToName: row.billed_to_name,
        billedToKind: row.billed_to_kind,
        billingEmail: row.billing_email,
        billingPhone: row.billing_phone,
        reference: row.reference,
        notes: row.notes,
        invoices: invoices.map(toInvoiceRow),
        health: billingHealth(
          { period: row.period, startDate: row.start_date, commitmentMonths: row.commitment_months },
          invoices.map(toScheduleInvoice),
          today,
        ),
      }
    })
  }

  /**
   * The same clients, laid out as a TWELVE-MONTH CALENDAR: one row per client,
   * one column per month, one cell per period (#1653).
   *
   * READ ONLY, and deliberately narrower than {@link listManualClients}: no
   * owner email, no billing contact, no notes. A calendar answers « what is
   * late, where » — it has no reason to carry a client's contact details across
   * the wire on every render.
   *
   * The derivation is `manual-billing-calendar.ts`, which itself only READS
   * `windowsUntil` / `billingHealth` / `covers`. No threshold is redefined and
   * nothing is recomputed here — a second walk of the periods would eventually
   * disagree with the « Engagement · état » column about the same client.
   *
   * `anchorMonth` (`YYYY-MM`) is the last month shown; absent, illegible or in
   * the future, it falls back to the current month.
   */
  async listBillingCalendar(anchorMonth?: string): Promise<BillingCalendar> {
    const rows = await this.terms.find({ order: { start_date: 'DESC' } })
    // UN seul « aujourd'hui » pour toute la grille, comme dans la liste : deux
    // lectures d'horloge peuvent tomber de part et d'autre de minuit, et deux
    // clients seraient alors mesurés sur des jours différents. Horloge LOCALE
    // (GA-126) — `toISOString()` recule d'un jour deux heures par nuit à Paris.
    const today = localDayKey(new Date())
    if (rows.length === 0) return buildBillingCalendar([], today, anchorMonth)

    const workspaceIds = rows.map(row => row.workspace_id)
    const [workspaces, ledger] = await Promise.all([
      this.workspaces.find({ where: { id: In(workspaceIds) } }),
      this.invoices.find({ where: { workspace_id: In(workspaceIds) }, order: { period_start: 'DESC' } }),
    ])
    const nameById = new Map(workspaces.map(workspace => [workspace.id, workspace.name]))

    const ledgerByWorkspace = new Map<string, ManualBillingInvoiceEntity[]>()
    for (const invoice of ledger) {
      const bucket = ledgerByWorkspace.get(invoice.workspace_id)
      if (bucket) bucket.push(invoice)
      else ledgerByWorkspace.set(invoice.workspace_id, [invoice])
    }

    return buildBillingCalendar(
      rows.map(row => ({
        workspaceId: row.workspace_id,
        workspaceName: nameById.get(row.workspace_id) ?? '(espace supprimé)',
        terms: {
          period: row.period,
          startDate: asDay(row.start_date) ?? row.start_date,
          commitmentMonths: row.commitment_months,
        },
        amountCents: row.amount_cents,
        currency: row.currency,
        invoices: (ledgerByWorkspace.get(row.workspace_id) ?? []).map(invoice => ({
          ...toScheduleInvoice(invoice),
          amountCents: invoice.amount_cents,
          currency: invoice.currency,
        })),
      })),
      today,
      anchorMonth,
    )
  }

  /** The invoices of one client, most recent period first. */
  async listInvoices(workspaceId: string): Promise<ManualInvoiceRow[]> {
    const rows = await this.invoices.find({ where: { workspace_id: workspaceId }, order: { period_start: 'DESC' } })
    return rows.map(toInvoiceRow)
  }

  /**
   * Record an invoice the operator has emitted elsewhere.
   *
   * The period defaults to the FIRST window the ledger does not cover yet —
   * which is what the operator means 95 % of the time (« j'ai facturé le mois
   * qui manque »), and is derived, never typed twice. A period can still be
   * given explicitly for a catch-up or a split invoice.
   */
  async recordInvoice(
    workspaceId: string,
    input: {
      reference: string
      amountCents?: number
      currency?: string
      periodStart?: string
      periodEnd?: string
      issuedOn?: string
      paymentStatus?: ManualInvoicePaymentStatus
      paidOn?: string
      notes?: string
    },
  ): Promise<ManualInvoiceRow> {
    const terms = await this.terms.findOne({ where: { workspace_id: workspaceId } })
    if (!terms) throw new NotFoundException(`Aucune condition de facturation pour l'espace ${workspaceId}`)

    const reference = input.reference.trim()
    if (!reference) throw new BadRequestException('Une facture porte une référence — celle émise dans la comptabilité.')

    const duplicate = await this.invoices
      .createQueryBuilder('i')
      .where('i.workspace_id = :workspaceId', { workspaceId })
      .andWhere('LOWER(i.reference) = LOWER(:reference)', { reference })
      .getOne()
    if (duplicate) {
      // La même facture enregistrée deux fois ferait paraître couverte une
      // période qui ne l'est pas — exactement le défaut qu'on corrige.
      throw new ConflictException(`La facture ${reference} est déjà enregistrée pour cet espace.`)
    }

    const window = await this.resolvePeriod(terms, input.periodStart, input.periodEnd)
    const paymentStatus = input.paymentStatus ?? 'unpaid'

    const saved = await this.invoices.save(
      this.invoices.create({
        workspace_id: workspaceId,
        reference,
        amount_cents: input.amountCents ?? terms.amount_cents,
        currency: (input.currency ?? terms.currency).toUpperCase(),
        period_start: window.start,
        period_end: window.end,
        issued_on: input.issuedOn ?? null,
        payment_status: paymentStatus,
        // Une date d'encaissement sur une facture NON payée serait une
        // contradiction écrite en base : on n'en garde qu'une des deux.
        paid_on: paymentStatus === 'paid' ? (input.paidOn ?? null) : null,
        notes: input.notes?.trim() || null,
      }),
    )
    return toInvoiceRow(saved)
  }

  /**
   * Correct an invoice: mark it cashed in, fix a mistyped reference or period.
   *
   * There is no delete. An invoice that turns out to be wrong is corrected —
   * « on archive, on ne supprime pas », and a ledger with holes cannot be
   * reconciled with the accounting tool it mirrors.
   */
  async updateInvoice(
    invoiceId: string,
    patch: {
      reference?: string
      amountCents?: number
      periodStart?: string
      periodEnd?: string
      issuedOn?: string | null
      paymentStatus?: ManualInvoicePaymentStatus
      paidOn?: string | null
      notes?: string
    },
  ): Promise<ManualInvoiceRow> {
    const existing = await this.invoices.findOne({ where: { id: invoiceId } })
    if (!existing) throw new NotFoundException(`Facture ${invoiceId} introuvable.`)

    const periodStart = patch.periodStart ?? existing.period_start
    const periodEnd = patch.periodEnd ?? existing.period_end
    if (periodEnd < periodStart) {
      throw new BadRequestException('La fin de période précède son début.')
    }

    const paymentStatus = patch.paymentStatus ?? existing.payment_status
    const merged = this.invoices.merge(existing, {
      ...(patch.reference !== undefined ? { reference: patch.reference.trim() } : {}),
      ...(patch.amountCents !== undefined ? { amount_cents: patch.amountCents } : {}),
      period_start: periodStart,
      period_end: periodEnd,
      ...(patch.issuedOn !== undefined ? { issued_on: patch.issuedOn } : {}),
      payment_status: paymentStatus,
      paid_on: paymentStatus === 'paid' ? (patch.paidOn ?? existing.paid_on) : null,
      ...(patch.notes !== undefined ? { notes: patch.notes.trim() || null } : {}),
    })
    return toInvoiceRow(await this.invoices.save(merged))
  }

  /**
   * Operator corrects the CONTRACT: the commitment he agreed to, who the
   * invoice goes to, the reference of the contract itself.
   *
   * Payment is no longer here — it belongs to an invoice, and a period that was
   * never invoiced has no payment to report. `commitmentMonths: null` is an
   * explicit « no commitment », and is honoured: it is the only way to correct
   * a duration typed by mistake.
   */
  async updateTerms(
    workspaceId: string,
    patch: {
      commitmentMonths?: number | null
      billedToName?: string | null
      billedToKind?: ManualBillingBilledToKind | null
      billingEmail?: string | null
      billingPhone?: string | null
      reference?: string
      notes?: string
    },
  ): Promise<ManualClientRow> {
    const existing = await this.terms.findOne({ where: { workspace_id: workspaceId } })
    if (!existing) {
      throw new NotFoundException(`Aucune condition de facturation pour l'espace ${workspaceId}`)
    }
    const merged = this.terms.merge(existing, {
      ...(patch.commitmentMonths !== undefined ? { commitment_months: patch.commitmentMonths } : {}),
      ...(patch.billedToName !== undefined ? { billed_to_name: patch.billedToName?.trim() || null } : {}),
      ...(patch.billedToKind !== undefined ? { billed_to_kind: patch.billedToKind } : {}),
      ...(patch.billingEmail !== undefined ? { billing_email: patch.billingEmail?.trim().toLowerCase() || null } : {}),
      ...(patch.billingPhone !== undefined ? { billing_phone: patch.billingPhone?.trim() || null } : {}),
      ...(patch.reference !== undefined ? { reference: patch.reference.trim() || null } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes.trim() || null } : {}),
    })
    await this.terms.save(merged)

    const rows = await this.listManualClients()
    const row = rows.find(r => r.workspaceId === workspaceId)
    if (!row) throw new NotFoundException(`Aucune condition de facturation pour l'espace ${workspaceId}`)
    return row
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * LA RELANCE D'UNE FACTURE EN RETARD (#1655)
   * ─────────────────────────────────────────────────────────────────────────
   * ⚠️ AUCUNE DE CES TROIS MÉTHODES N'ENVOIE QUOI QUE CE SOIT. Elles préparent
   * un texte, consignent qu'un humain l'a envoyé, et déclarent un litige. Il n'y
   * a ici ni transport, ni file d'envoi, ni appel réseau sortant — « le copilote
   * prépare, le commercial envoie » n'est pas une convention, c'est l'absence de
   * code, et `manual-billing-reminder-no-send.spec.ts` le mesure sur le texte du
   * lot entier plutôt que sur ce commentaire.
   */

  /**
   * La relance PRÉPARÉE pour une période, ou le refus qui dit pourquoi il n'y en
   * a pas.
   *
   * `periodStart` désigne la période telle que le calendrier la dérive — c'est
   * exactement la clé qu'une cellule porte déjà. Une période inconnue du contrat
   * lève : une URL retapée à la main ne doit pas se voir répondre par une
   * relance sur une période inventée.
   *
   * `tone` est le ton CHOISI par l'opérateur (règle 3 de #1655). Absent, c'est
   * la cadence qui décide ; le résultat porte toujours les deux.
   */
  async prepareInvoiceReminder(
    workspaceId: string,
    periodStart: string,
    tone?: ReminderTone | null,
  ): Promise<ManualReminderView> {
    const terms = await this.terms.findOne({ where: { workspace_id: workspaceId } })
    if (!terms) throw new NotFoundException(`Aucune condition de facturation pour l'espace ${workspaceId}`)

    const today = localDayKey(new Date())
    const start = asDay(periodStart) ?? periodStart
    // LA marche du module, jamais une seconde : deux dérivations des périodes
    // finiraient par ne pas désigner la même « période du 1er juin ».
    const window = windowsUntil(
      {
        period: terms.period,
        startDate: asDay(terms.start_date) ?? terms.start_date,
        commitmentMonths: terms.commitment_months,
      },
      today,
    ).find(candidate => candidate.start === start)
    if (!window) {
      throw new NotFoundException(`Aucune période ne commence le ${start} pour l'espace ${workspaceId}.`)
    }

    const ledger = await this.invoices.find({ where: { workspace_id: workspaceId } })
    const covering = ledger.find(invoice => covers(toScheduleInvoice(invoice), window)) ?? null
    const workspace = await this.workspaces.findOne({ where: { id: workspaceId } })

    return {
      workspaceId,
      workspaceName: workspace?.name ?? '(espace supprimé)',
      window,
      reminder: prepareReminder({
        invoice: covering ? toReminderInvoice(covering) : null,
        client: {
          workspaceName: workspace?.name ?? '(espace supprimé)',
          billedToName: terms.billed_to_name,
          billingEmail: terms.billing_email,
        },
        disputeReason: covering?.dispute_reason ?? null,
        today,
        requestedTone: tone ?? null,
      }),
    }
  }

  /**
   * CONSIGNER une relance qu'un humain vient d'envoyer — règle 4 de #1655,
   * « chaque relance est journalisée avec sa date et son auteur ».
   *
   * ⚠️ La porte est AUSSI LARGE QUE LE FLUX, pas plus : consigner rejoue la même
   * préparation que l'écran, et REFUSE tout ce que l'écran refuse — un litige
   * ouvert, une facture payée, une cadence épuisée, une échéance pas encore
   * atteinte. Une écriture plus permissive que la lecture qui la précède est un
   * défaut que ce dépôt a déjà payé : l'écran dit « suspendu », l'appel direct
   * consigne quand même, et le compteur avance sur une facture contestée.
   *
   * `actor` est l'adresse authentifiée de l'opérateur (#1668), propagée par le
   * back-office. Sans auteur, la trace dit « quelqu'un », ce qui n'est pas une
   * trace.
   *
   * ⚠️ CE LOT NE CONSTRUIT PAS DE SECOND JOURNAL. L'historique vit sur la
   * facture, et l'événement {@link BILLING_REMINDER_LOGGED_EVENT} est le point
   * d'accroche du journal d'actions unique (#1666).
   */
  async logInvoiceReminder(invoiceId: string, input: { tone: ReminderTone; actor: string }): Promise<ManualInvoiceRow> {
    const invoice = await this.invoices.findOne({ where: { id: invoiceId } })
    if (!invoice) throw new NotFoundException(`Facture ${invoiceId} introuvable.`)

    const actor = input.actor.trim()
    if (!actor) throw new BadRequestException('Une relance consignée porte son auteur.')

    const view = await this.prepareInvoiceReminder(
      invoice.workspace_id,
      asDay(invoice.period_start) ?? invoice.period_start,
      input.tone,
    )
    if (!view.reminder.prepared) {
      throw new BadRequestException(`Aucune relance n'est due sur cette facture (${view.reminder.reason}).`)
    }

    const entry: LoggedReminder = {
      at: new Date().toISOString(),
      by: actor,
      tone: view.reminder.tone,
      index: view.reminder.index,
    }
    invoice.reminders = [...toReminderHistory(invoice.reminders), entry]
    const saved = await this.invoices.save(invoice)

    // L'événement que #1666 écoute. Le corps du message n'y entre PAS : le
    // journal dit qu'une relance a été envoyée, il n'archive pas le courrier.
    this.logger.log('Relance de facturation consignée', {
      tags: {
        'admin.op': BILLING_REMINDER_LOGGED_EVENT,
        'billing.invoice_id': invoice.id,
        'billing.workspace_id': invoice.workspace_id,
        'billing.reminder_index': String(entry.index),
        'billing.reminder_tone': entry.tone,
        'admin.actor': actor,
      },
    })

    return toInvoiceRow(saved)
  }

  /**
   * DÉCLARER un litige sur une facture, ou le LEVER — la porte de la règle 2 de
   * #1655.
   *
   * Le motif est OBLIGATOIRE à la déclaration : « en litige » sans rien d'autre
   * ne se relit pas dans six mois, et c'est justement ce qu'il faut relire pour
   * décider quoi faire de la facture. La contrainte SQL le tient aussi.
   *
   * On n'efface JAMAIS `disputed_at` en levant : on archive, on ne supprime pas,
   * et un litige levé reste ce qui explique le retard.
   */
  async setInvoiceDispute(invoiceId: string, input: { reason?: string; resolve?: boolean }): Promise<ManualInvoiceRow> {
    const invoice = await this.invoices.findOne({ where: { id: invoiceId } })
    if (!invoice) throw new NotFoundException(`Facture ${invoiceId} introuvable.`)

    if (input.resolve) {
      if (!invoice.disputed_at) {
        throw new BadRequestException('Aucun litige n’est déclaré sur cette facture.')
      }
      // Idempotent : une levée déjà enregistrée garde SA date. La réécrire
      // ferait glisser la fin d'un litige à chaque clic.
      invoice.dispute_resolved_at = invoice.dispute_resolved_at ?? new Date()
      return toInvoiceRow(await this.invoices.save(invoice))
    }

    const reason = input.reason?.trim()
    if (!reason) {
      throw new BadRequestException('Un litige porte son motif : ce que le client reproche, dans ses mots.')
    }
    // Un litige ROUVERT repart à sa nouvelle date et sa nouvelle raison — une
    // correction humaine gagne toujours. Un litige déjà ouvert garde la sienne :
    // c'est le jour où le client a contesté, pas celui où on a corrigé le texte.
    if (!invoice.disputed_at || invoice.dispute_resolved_at) {
      invoice.disputed_at = new Date()
      invoice.dispute_resolved_at = null
    }
    invoice.dispute_reason = reason
    return toInvoiceRow(await this.invoices.save(invoice))
  }

  /**
   * Find or create the owner's auth account.
   *
   * Idempotency: an email that already has an account is REUSED — never
   * duplicated, never taken over. The one case we refuse outright is an account
   * carrying a live Stripe subscription: silently flipping a self-serve
   * subscriber to invoice billing would leave them paying twice (Stripe keeps
   * charging) while the webhooks and this row disagree about who owns the plan.
   * The operator cancels the Stripe subscription first, deliberately.
   */
  private async resolveOwner(
    email: string,
    identity: { firstName?: string; lastName?: string },
  ): Promise<{ userId: string; created: boolean }> {
    const existing = await this.profiles.findOne({ where: { email } })

    if (existing) {
      const sub = await this.subscriptions.findOne({ where: { user_id: existing.user_id } })
      if (sub?.stripe_subscription_id) {
        throw new ConflictException(
          `${email} a déjà un abonnement Stripe actif. Résiliez-le dans Stripe avant de basculer ce client en facturation manuelle.`,
        )
      }
      return { userId: existing.user_id, created: false }
    }

    // NOTE — no `password` field, ever. The account is created without
    // credentials; the human sets their own through the password-reset link the
    // operator sends from the user detail screen. Creating credentials on
    // someone's behalf is out of bounds, so there is nothing here to leak.
    let userId: string | undefined
    let error: { message: string } | null = null
    try {
      const response = await this.supabase.getClient().auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: {
          ...(identity.firstName ? { first_name: identity.firstName } : {}),
          ...(identity.lastName ? { last_name: identity.lastName } : {}),
        },
      })
      userId = response.data?.user?.id
      error = response.error
    } catch (err) {
      /*
       * ⚠️ LA CRÉATION A-T-ELLE PU PARTIR ? C'est la seule question.
       *
       * Une connexion jamais établie (DNS, port fermé, certificat — dont
       * `UND_ERR_CONNECT_TIMEOUT`, qui porte le mot « timeout » sans en être un)
       * n'a rien créé : l'opérateur peut relancer sans risque.
       *
       * Une requête PARTIE dont la réponse n'est pas revenue est un `unknown` :
       * le compte existe peut-être. Relancer créerait un doublon d'identité, et
       * « supprimer par précaution » supprimerait peut-être un compte légitime.
       * On s'arrête, et on NOMME l'adresse à vérifier.
       */
      const outcome = outcomeOfFailure(err)
      this.logger.error(`Manual provisioning: auth user creation ${outcome} for ${email}`, {
        error: err,
        tags: { 'admin.op': 'client.provision', 'admin.provision.outcome': outcome },
      })
      throw new BadRequestException(
        outcome === 'unknown'
          ? `La création du compte ${email} est partie sans réponse : il existe peut-être. ` +
              'Vérifiez dans la console avant de relancer — relancer créerait un doublon.'
          : `Création du compte propriétaire impossible : ${err instanceof Error ? err.message : String(err)}.`,
      )
    }

    if (error || !userId) {
      this.logger.error(`Manual provisioning: auth user creation failed for ${email}`, {
        error,
        tags: { 'admin.op': 'client.provision' },
      })
      throw new BadRequestException(`Création du compte propriétaire impossible${error ? ` : ${error.message}` : ''}.`)
    }

    return { userId, created: true }
  }

  /**
   * The ESN workspace. `handle_new_user_workspace` already created one named
   * « Mon espace » on the auth insert, so the normal path is a rename — we only
   * create when that safety net didn't fire (or the account predates it).
   */
  private async resolveWorkspace(repos: TxRepos, ownerUserId: string, name: string): Promise<WorkspaceEntity> {
    const existing = await repos.workspaces.findOne({
      where: { owner_user_id: ownerUserId },
      order: { created_at: 'ASC' },
    })

    if (existing) {
      existing.name = name
      const saved = await repos.workspaces.save(existing)
      await this.ensureOwnerMembership(repos, saved.id, ownerUserId)
      return saved
    }

    const created = await repos.workspaces.save(repos.workspaces.create({ name, owner_user_id: ownerUserId }))
    await this.ensureOwnerMembership(repos, created.id, ownerUserId)
    return created
  }

  private async ensureOwnerMembership(repos: TxRepos, workspaceId: string, userId: string): Promise<void> {
    const member = await repos.members.findOne({ where: { workspace_id: workspaceId, user_id: userId } })
    if (member) return
    await repos.members.save(repos.members.create({ workspace_id: workspaceId, user_id: userId, role: 'owner' }))
  }

  /**
   * The entitlement row. Beyond plan + quotas this fixes the three fields that
   * would otherwise make a manually-provisioned client fail weeks later:
   *
   *  - `billing_mode: 'manual'` — the explicit flag the billing paths read, so
   *    no job has to guess from a NULL Stripe id;
   *  - `trial_end: null` — a leftover trial window would lock the account the
   *    moment anything set the plan back to `trial`;
   *  - `period_start: now()` — the monthly reset is a rolling window per row.
   *    Left at signup date, the client's first refill lands at an arbitrary
   *    moment; anchored here, they get a full month from day one.
   *
   * The Stripe ids stay NULL. That is load-bearing: both webhook UPDATEs match
   * on `stripe_subscription_id = :id` WITHOUT a user scope, and only SQL NULL is
   * guaranteed never to match. Writing a placeholder here would let one webhook
   * zero every manual client at once.
   */
  private async writeManualSubscription(
    repos: TxRepos,
    userId: string,
    input: ProvisionClientInput,
  ): Promise<SubscriptionEntity> {
    const config = await this.planCatalog.getOrDefault(input.plan)
    const existing = await repos.subscriptions.findOne({ where: { user_id: userId } })

    const merged = repos.subscriptions.merge(existing ?? repos.subscriptions.create({ user_id: userId }), {
      plan: input.plan,
      accounts_limit: input.accountsLimit ?? config.accounts_limit,
      enrichment_credits: input.enrichmentCredits ?? config.enrichment_credits,
      extra_seats: input.extraSeats ?? 0,
      billing_mode: 'manual',
      trial_end: null,
      period_start: new Date(),
      // A fresh contract starts with a full allowance — same convention as the
      // `checkout.session.completed` grant.
      accounts_used: 0,
    })

    return repos.subscriptions.save(merged) as Promise<SubscriptionEntity>
  }

  /**
   * L'ENVELOPPE INITIALE au grand livre des crédits (#1665, étape 4).
   *
   * ⚠️ CE QUI MANQUAIT, ET POURQUOI ÇA COMPTE. Les quotas étaient bien posés sur
   * `subscriptions` — c'est le SOLDE, il est juste — mais aucune ligne n'était
   * écrite dans `credit_ledger`, qui est l'HISTORIQUE. Un client provisionné à la
   * main ouvrait donc son grand livre à vide : la première consommation
   * apparaissait sans que rien n'explique d'où venaient les crédits, et
   * l'enveloppe négociée n'était traçable nulle part. C'est exactement la
   * distinction que l'entité déclare : « the running counters are a balance, not
   * a history ».
   *
   * Deux lignes, une par ressource, `kind: 'grant_plan'` — le MÊME mot que
   * `credits.service` écrit déjà à chaque remise à zéro mensuelle. Aucune valeur
   * neuve n'est introduite : `credit_ledger.kind` est une colonne `text` SANS
   * contrainte `CHECK` (migration 1784900500000), donc rien à élargir, et surtout
   * rien à inventer — un troisième vocabulaire pour le même fait rendrait
   * l'historique illisible.
   *
   * Elles vivent DANS la transaction : une enveloppe journalisée pour un espace
   * annulé serait un crédit fantôme.
   *
   * ⚠️ Ce n'est PAS un second crédit. Le solde reste `subscriptions`
   * (`accounts_limit` / `enrichment_credits`, posés juste au-dessus) ; ces lignes
   * sont de l'audit, et rien ne les additionne à quoi que ce soit.
   */
  private async openCreditEnvelope(
    repos: TxRepos,
    ownerUserId: string,
    workspaceId: string,
    subscription: SubscriptionEntity,
    plan: string,
  ): Promise<void> {
    const rows = [
      { resource: 'analysis_slot' as const, delta: subscription.accounts_limit },
      { resource: 'enrichment_credit' as const, delta: subscription.enrichment_credits },
    ].filter(row => row.delta > 0)
    if (rows.length === 0) return

    await repos.creditLedger.insert(
      rows.map(row => ({
        owner_user_id: ownerUserId,
        workspace_id: workspaceId,
        // Aucun `actor_user_id` : l'opérateur du back-office n'est PAS un
        // utilisateur de cet espace, et l'y inscrire ferait apparaître un membre
        // fantôme dans l'historique du client.
        actor_user_id: null,
        kind: 'grant_plan' as const,
        resource: row.resource,
        delta: row.delta,
        reason: `Provisionnement manuel — enveloppe initiale du palier ${plan}`,
        account_id: null,
      })),
    )
  }

  /**
   * Upsert the commercial terms (one row per workspace).
   *
   * Read by no GATE — nothing here suspends an account at the end of the
   * commitment. Read by a WARNING since 02/09/2026: `commitment_months` is what
   * lets the backoffice say « l'engagement s'achève dans 12 jours » instead of
   * hiding it in a sentence nobody re-reads.
   */
  private async writeTerms(
    repos: TxRepos,
    workspaceId: string,
    billing: ProvisionClientInput['billing'],
  ): Promise<ManualBillingTermsEntity> {
    const existing = await repos.terms.findOne({ where: { workspace_id: workspaceId } })
    const merged = repos.terms.merge(existing ?? repos.terms.create({ workspace_id: workspaceId }), {
      amount_cents: billing.amountCents,
      currency: (billing.currency ?? 'EUR').toUpperCase(),
      period: billing.period,
      start_date: billing.startDate,
      // Absent = aucun engagement enregistré. Jamais `0` : « zéro mois » se
      // lirait comme un contrat qui se termine le jour où il commence.
      commitment_months: billing.commitmentMonths ?? null,
      billed_to_name: billing.billedToName?.trim() || null,
      billed_to_kind: billing.billedToKind ?? null,
      billing_email: billing.billingEmail?.trim().toLowerCase() || null,
      billing_phone: billing.billingPhone?.trim() || null,
      reference: billing.reference?.trim() || null,
      notes: billing.notes?.trim() || null,
    })
    return repos.terms.save(merged) as Promise<ManualBillingTermsEntity>
  }

  /**
   * Open the ledger with the first invoice, when the operator has its number.
   *
   * Without a reference nothing is written — an invoice row with no number
   * would claim a document exists that nobody can find in the accounting tool.
   * The first period is then legitimately reported as missing an invoice, which
   * is the truth: none is recorded.
   */
  private async openLedger(
    repos: TxRepos,
    workspaceId: string,
    billing: ProvisionClientInput['billing'],
  ): Promise<ManualBillingInvoiceEntity | null> {
    const reference = billing.reference?.trim()
    if (!reference) return null

    const existing = await repos.invoices
      .createQueryBuilder('i')
      .where('i.workspace_id = :workspaceId', { workspaceId })
      .andWhere('LOWER(i.reference) = LOWER(:reference)', { reference })
      .getOne()
    // Re-provisioning the same client is idempotent everywhere else; the ledger
    // follows — a second run must not double the September invoice.
    if (existing) return existing

    const paid = billing.paymentStatus === 'paid'
    return repos.invoices.save(
      repos.invoices.create({
        workspace_id: workspaceId,
        reference,
        amount_cents: billing.amountCents,
        currency: (billing.currency ?? 'EUR').toUpperCase(),
        period_start: billing.startDate,
        period_end: periodEndOf(billing.period, billing.startDate),
        issued_on: null,
        payment_status: paid ? 'paid' : 'unpaid',
        paid_on: null,
        notes: null,
      }),
    )
  }

  /**
   * The period an invoice covers: the one given, or — by default — the OLDEST
   * one the ledger does not cover yet.
   *
   * Derived rather than typed, because « la facture du mois qui manque » is
   * what the operator means when he records one, and a period retyped by hand
   * is a period that lands one day off and leaves a phantom hole behind.
   */
  private async resolvePeriod(
    terms: ManualBillingTermsEntity,
    givenStart?: string,
    givenEnd?: string,
  ): Promise<{ start: string; end: string }> {
    if (givenStart) {
      const end = givenEnd ?? periodEndOf(terms.period, givenStart)
      if (end < givenStart) throw new BadRequestException('La fin de période précède son début.')
      return { start: givenStart, end }
    }

    const existing = await this.invoices.find({ where: { workspace_id: terms.workspace_id } })
    const health = billingHealth(
      { period: terms.period, startDate: terms.start_date, commitmentMonths: terms.commitment_months },
      existing.map(toScheduleInvoice),
      localDayKey(new Date()),
    )
    const missing = health.windowsMissing[0]
    if (missing) return missing
    // Rien ne manque : la facture porte sur la période EN COURS (une avance),
    // ou sur la première quand le contrat n'a pas encore commencé.
    return health.currentWindow ?? { start: terms.start_date, end: periodEndOf(terms.period, terms.start_date) }
  }

  /**
   * Invite the client's team through the production invitation flow, AS the
   * owner — so the plan's seat cap, the "already a member" check and the pending
   * -invite dedupe all apply exactly as they would in-app.
   *
   * One failure does not roll the workspace back. The client exists and is
   * usable; a teammate who could not be invited is reported so the operator can
   * fix it (usually a seat cap or a mail transport) rather than discovering it
   * from the client.
   */
  private async inviteTeam(
    ownerUserId: string,
    ownerEmail: string,
    team: Array<{ email: string; role: InvitableRole }>,
  ): Promise<ProvisionedInvitation[]> {
    const results: ProvisionedInvitation[] = []
    const seen = new Set<string>([ownerEmail])

    for (const entry of team) {
      const email = normaliseEmail(entry.email)
      // The owner is already a member, and a duplicate line in the form would
      // otherwise 409 on itself.
      if (seen.has(email)) continue
      seen.add(email)

      try {
        const { emailSent, emailError } = await this.team.createInvitationWithDelivery(ownerUserId, {
          email,
          role: entry.role,
        })
        results.push({ email, role: entry.role, created: true, emailSent, error: emailError })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        this.logger.warn(`Manual provisioning: invitation for ${email} failed (${message})`)
        results.push({ email, role: entry.role, created: false, emailSent: false, error: message })
      }
    }

    return results
  }
}

function normaliseEmail(value: string): string {
  return value.trim().toLowerCase()
}

/**
 * Les dépôts de LA transaction. Six tables, une seule unité de travail.
 *
 * Ils sont pris sur l'`EntityManager` de la transaction, jamais sur les dépôts
 * injectés : c'est ce qui fait qu'un échec à l'étape 4 n'a laissé ni espace ni
 * abonnement. Un `this.workspaces.save()` glissé dans ce chemin écrirait HORS
 * transaction et rendrait le T1 faux sans qu'aucun test du service ne bouge —
 * `manual-provisioning.service.spec.ts` mesure donc que TOUTES les écritures ont
 * lieu la transaction OUVERTE.
 */
interface TxRepos {
  workspaces: Repository<WorkspaceEntity>
  members: Repository<WorkspaceMemberEntity>
  subscriptions: Repository<SubscriptionEntity>
  terms: Repository<ManualBillingTermsEntity>
  invoices: Repository<ManualBillingInvoiceEntity>
  creditLedger: Repository<CreditLedgerEntity>
}

function reposOf(manager: EntityManager): TxRepos {
  return {
    workspaces: manager.getRepository(WorkspaceEntity),
    members: manager.getRepository(WorkspaceMemberEntity),
    subscriptions: manager.getRepository(SubscriptionEntity),
    terms: manager.getRepository(ManualBillingTermsEntity),
    invoices: manager.getRepository(ManualBillingInvoiceEntity),
    creditLedger: manager.getRepository(CreditLedgerEntity),
  }
}

/** Ce que la transaction rend une fois COMMISE — jamais avant. */
interface CommittedProvisioning {
  workspace: WorkspaceEntity
  subscription: SubscriptionEntity
  terms: ManualBillingTermsEntity
  firstInvoice: ManualBillingInvoiceEntity | null
}

function toInvoiceRow(row: ManualBillingInvoiceEntity): ManualInvoiceRow {
  return {
    id: row.id,
    reference: row.reference,
    amountCents: row.amount_cents,
    currency: row.currency,
    // `asDay` aux frontières : une colonne `date` rend une chaîne par
    // l'hydratation d'entité, un objet `Date` dès qu'un chemin passe en SQL
    // brut. Le repli ne fabrique pas de date — il rend la valeur telle quelle.
    periodStart: asDay(row.period_start) ?? row.period_start,
    periodEnd: asDay(row.period_end) ?? row.period_end,
    issuedOn: asDay(row.issued_on),
    paymentStatus: row.payment_status,
    paidOn: asDay(row.paid_on),
    notes: row.notes,
    disputedAt: asIso(row.disputed_at),
    disputeReason: row.dispute_reason,
    disputeResolvedAt: asIso(row.dispute_resolved_at),
    reminders: toReminderHistory(row.reminders),
  }
}

/**
 * Une colonne `timestamptz` ramenée à une chaîne ISO.
 *
 * Le pendant de `asDay` pour les horodatages : l'hydratation d'entité rend un
 * `Date`, un chemin en SQL brut rend une chaîne. Une valeur illisible rend
 * `null` — « on ne sait pas » — jamais une date de remplissage.
 */
function asIso(value: Date | string | null): string | null {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString()
  return typeof value === 'string' && value.length > 0 ? value : null
}

/**
 * L'historique des relances, relu défensivement.
 *
 * ⚠️ `jsonb` n'a pas de type au-delà de « c'est du JSON » : la contrainte SQL
 * garantit un TABLEAU, jamais la forme de ses éléments. Une entrée illisible est
 * ÉCARTÉE plutôt que rendue à moitié — un rang faux, c'est un ton faux dans une
 * relance client. Les lignes antérieures à la migration portent `[]`.
 */
function toReminderHistory(value: unknown): LoggedReminder[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is LoggedReminder => {
    if (!entry || typeof entry !== 'object') return false
    const candidate = entry as Record<string, unknown>
    return (
      typeof candidate['at'] === 'string' &&
      typeof candidate['by'] === 'string' &&
      typeof candidate['tone'] === 'string' &&
      typeof candidate['index'] === 'number'
    )
  })
}

/** La facture, telle que la préparation d'une relance la lit (#1655). */
function toReminderInvoice(row: ManualBillingInvoiceEntity): InvoiceForReminder {
  return {
    id: row.id,
    reference: row.reference,
    // `null` et non `0` quand la colonne est illisible : « non mesuré » n'est
    // jamais « mesuré à zéro », et la relance se REFUSE plutôt que de partir
    // avec un montant faux.
    amountCents: typeof row.amount_cents === 'number' ? row.amount_cents : null,
    currency: row.currency || null,
    periodStart: asDay(row.period_start) ?? row.period_start,
    periodEnd: asDay(row.period_end) ?? row.period_end,
    paid: row.payment_status === 'paid',
    disputedAt: asIso(row.disputed_at),
    disputeResolvedAt: asIso(row.dispute_resolved_at),
    reminders: toReminderHistory(row.reminders),
  }
}

function toScheduleInvoice(row: ManualBillingInvoiceEntity): InvoiceForSchedule {
  return {
    reference: row.reference,
    periodStart: asDay(row.period_start) ?? row.period_start,
    periodEnd: asDay(row.period_end) ?? row.period_end,
    // Le STATUT, jamais la date : dix-sept lignes reprises sont encaissées sans
    // qu'on sache quand, et lire `paid_on` les rendrait toutes impayées.
    paid: row.payment_status === 'paid',
  }
}
