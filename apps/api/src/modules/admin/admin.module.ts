import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { AnalysisRunEntity } from '../../database/entities/analysis-run.entity'
import { BetaFeedbackEntity } from '../../database/entities/beta-feedback.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { CreditLedgerEntity } from '../../database/entities/credit-ledger.entity'
import { ChatMessageEntity } from '../../database/entities/chat-message.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { UserLastSeenEntity } from '../../database/entities/user-last-seen.entity'
import { ManualBillingSweepService } from './manual-billing-sweep.service'
import { LocksModule } from '../locks/locks.module'
import { ManualBillingInvoiceEntity } from '../../database/entities/manual-billing-invoice.entity'
import { ManualBillingTermsEntity } from '../../database/entities/manual-billing-terms.entity'
// L'état persisté de l'e-mail d'activation du propriétaire (#2643.2).
import { OwnerInvitationEntity } from '../../database/entities/owner-invitation.entity'
import { EsnProfileEntity } from '../../database/entities/esn-profile.entity'
import { NotificationPreferenceEntity } from '../../database/entities/notification-preference.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { SubscriptionEntity } from '../../database/entities/subscription.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceInvitationEntity } from '../../database/entities/workspace-invitation.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { AnalysisModule } from '../analysis/analysis.module'
import { DemoModule } from '../demo/demo.module'
import { PlanCatalogModule } from '../credits/plan-catalog.module'
import { PlanPriceSyncModule } from '../credits/plan-price-sync.module'
import { PlanCatalogService } from '../credits/plan-catalog.service'
// ── #1647, la file de décision ──
// `creditCapacity` est LE plafond qui refuse une analyse ; `FeedbackService`
// est le seul à savoir ce qui a été FAIT d'un retour. Les deux entrent par un
// JETON — voir `decision-queue-tokens.ts` pour la raison (GA-07 au plafond).
import { creditCapacity } from '../credits/credits.service'
import { FeedbackModule } from '../feedback/feedback.module'
import { FeedbackService } from '../feedback/feedback.service'
import { ProviderCostEntity } from '../../database/entities/provider-cost.entity'
import { DecisionQueueController } from './decision-queue.controller'
import { DecisionQueueService } from './decision-queue.service'
import {
  DECISION_QUEUE_CREDIT_CAPACITY,
  DECISION_QUEUE_FEEDBACK_TRACKING,
  type CreditCapacityReader,
  type FeedbackTrackingReader,
} from './decision-queue-tokens'
import { AdminAnalysesController } from './admin-analyses.controller'
import { AdminSegmentCatchupController } from './admin-segment-catchup.controller'
import { AdminCommercialBriefBackfillController } from './admin-commercial-brief-backfill.controller'
import { AdminGroupHeadBackfillController } from './admin-group-head-backfill.controller'
import { GroupHeadBackfillService } from './group-head-backfill.service'
import { AdminMissingRolesCatchupController } from './admin-missing-roles-catchup.controller'
import { AdminContactReachabilityCatchupController } from './admin-contact-reachability-catchup.controller'
import { AdminInvalidPhoneArchiveController } from './admin-invalid-phone-archive.controller'
import { ContactsModule } from '../contacts/contacts.module'
import { AdminClientHealthController } from './admin-client-health.controller'
import { AdminCreditConsumptionController } from './admin-credit-consumption.controller'
import { AdminCreditConsumptionService } from './admin-credit-consumption.service'
import { AdminClientHealthService } from './admin-client-health.service'
import { AdminWorkspaceHealthController } from './admin-workspace-health.controller'
import { AdminWorkspaceHealthService } from './admin-workspace-health.service'
import { AdminProfileContextsController } from './admin-profile-contexts.controller'
import { AdminProfileContextsService } from './admin-profile-contexts.service'
import { AdminWeeklyDigestSweepController } from './admin-weekly-digest-sweep.controller'
import { AdminWeeklyDigestSweepService } from './admin-weekly-digest-sweep.service'
import { CLIENT_PLAN_GRIDS, type ClientPlanGrids, type ClientPlanGridsReader } from './client-health-tokens'
import { BackofficeAccessJournalController } from './backoffice-access-journal.controller'
import { BackofficeAccessJournalModule } from './backoffice-access-journal.module'
import { AdminAnalysesService } from './admin-analyses.service'
import { AdminOpsController } from './admin-ops.controller'
import { AdminOpsService } from './admin-ops.service'
import { AdminQueuesController } from './admin-queues.controller'
import { AdminQueuesService } from './admin-queues.service'
import { AdminService } from './admin.service'
import { AdminIdentityService } from './admin-identity.service'
import { AdminUsersService } from './admin-users.service'
import { AdminUsersController } from './admin-users.controller'
import { InternalAdminController } from './internal-admin.controller'
import { ManualProvisioningController } from './manual-provisioning.controller'
import { WorkspaceOwnershipTransferController } from './workspace-ownership-transfer.controller'
import { WorkspaceOwnershipTransferService } from './workspace-ownership-transfer.service'
import { ManualProvisioningService } from './manual-provisioning.service'
import { OwnerActivationService } from './owner-activation.service'
import { OwnerActivationSweepService } from './owner-activation-sweep.service'
import { SupabaseModule } from '../../supabase/supabase.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { EsnProfileModule } from '../esn-profile/esn-profile.module'
// #2975 — la porte de coût par espace vit dans son propre module (règle 7),
// pour qu'`AnalysisModule`/`CreditsModule` puissent l'importer sans importer
// tout `AdminModule` (qui importe déjà `AnalysisModule` — un retour créerait
// un cycle). `AdminModule` ne fait que la réutiliser pour son contrôleur.
import { WorkspaceBudgetModule } from '../workspace-budget/workspace-budget.module'
// #2643.1 — le branchement : `OwnerActivationService.send` appelle
// `MailerService` sur un clic opérateur. Sans cet import, l'e-mail
// d'activation resterait préparé mais jamais envoyable depuis le back-office.
import { MailerModule } from '../mailer/mailer.module'
// #2977 — `GET internal/admin/workspace-health/:workspaceId` réutilise
// `LauraProbeService`, déjà exporté par `LauraModule` pour « un futur
// consommateur (panneau back-office) » sans qu'aucun n'existe jusqu'ici.
import { LauraModule } from '../laura/laura.module'

/**
 * Super-admin backoffice module. Powers the standalone `dashboard-manager`
 * (Next.js) operator panel. Every route is behind `InternalSecretGuard` (shared
 * secret) — no end-user JWT. Self-contained: removing this module changes no
 * other module's behaviour.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProfileEntity,
      SubscriptionEntity,
      // La fiche ESN partagée, lue par la console (#1671-ter) : « le
      // propriétaire a-t-il rempli la fiche de son ESN ? » était une question
      // qui n'avait de réponse qu'en base de production.
      EsnProfileEntity,
      // Balayage `weekly_digest` hérité (#balayage-weekly-digest) : lecture
      // ET écriture guardées par `AdminWeeklyDigestSweepService`.
      NotificationPreferenceEntity,
      WorkspaceEntity,
      WorkspaceMemberEntity,
      WorkspaceInvitationEntity,
      AccountEntity,
      // Les fiches suivent leur dossier quand deux identités sont fusionnées
      // (IDENT-01) : sans elles, les contacts resteraient dans l'espace abandonné.
      ContactEntity,
      CreditLedgerEntity,
      // Commercial terms of invoice-billed clients (sales-led provisioning).
      ManualBillingInvoiceEntity,
      ManualBillingTermsEntity,
      // ── #1652, la santé d'un espace client sur `/revenus/clients` ──
      // Quatre tables en LECTURE SEULE, une par axe qu'elles alimentent :
      //  - `user_actions`   → l'activité (dernier geste) ET l'adoption
      //                       (types de gestes distincts / catalogue observé) ;
      //  - `user_last_seen` → les membres ACTIFS, face aux sièges payés ;
      //  - `analysis_runs`  → le dénominateur des incidents, et les erreurs ;
      //  - `beta_feedback`  → les RETOURS, joints par leur auteur (cette table
      //                       ne porte pas de `workspace_id` — dit dans le service).
      UserActionEntity,
      // #4423.1 — lu pour la « dernière activité » de la fiche utilisateur (dernier message à Laura).
      ChatMessageEntity,
      UserLastSeenEntity,
      AnalysisRunEntity,
      BetaFeedbackEntity,
      // ── #1647, la file de décision ──
      // Le registre des coûts fournisseurs, en LECTURE SEULE : `cost_spike`
      // compare le dernier jour COMPLET à la médiane des sept précédents. Le
      // module `analytics` possède la table et l'écrit ; ici on ne fait que la
      // lire, comme `AnalysisRunEntity` pour la santé client.
      ProviderCostEntity,
      // L'état persisté de l'e-mail d'activation du propriétaire (#2643.2) —
      // lu par `/esn/[id]`, écrit par la préparation ET par le clic d'envoi
      // (#2643.1).
      OwnerInvitationEntity,
    ]),
    // Le journal d'accès (#1671.2) vit dans son propre module : `PrivacyModule`
    // le consomme aussi pour la purge à douze mois, et souder les deux casserait
    // l'autonomie que la règle n°7 demande à chacun.
    BackofficeAccessJournalModule,
    // Sales-led provisioning creates the client's OWNER auth account (no
    // password — the human sets their own via the reset link).
    SupabaseModule,
    // Reuses the production invitation flow (seat cap, dedupe, token, mailer)
    // for the client's team instead of re-implementing invitations here.
    // One-way edge: WorkspaceModule never imports AdminModule, so no cycle.
    WorkspaceModule,
    // Read/mutate handles on the pipeline queues so the ops health surface can
    // report their depths (`getJobCounts`) and the queue viewer can list/retry/
    // remove/clean individual jobs. The queues are owned/configured by the
    // analysis + mailer modules (shared BullMQ root connection).
    BullModule.registerQueue({ name: 'analysis' }, { name: 'mailer' }),
    // Demo mode (C1): provisioning + golden-dataset seeding for `is_demo`
    // workspaces — exposed here via `POST internal/admin/workspaces/demo`.
    DemoModule,
    // Analysis pipeline — the operator STOP / force-error control reuses
    // `AnalysisService.cancelByAdmin` (the shared user-cancel machinery). One-way
    // edge: AnalysisModule never imports AdminModule, so no cycle.
    AnalysisModule,
    // #3549 — `ContactReachabilityCatchupService` (rattrapage des coordonnées
    // manquantes). Sens unique : ContactsModule n'importe jamais AdminModule.
    ContactsModule,
    // DB-backed editable plan catalog — powers GET/PATCH internal/admin/plans and
    // the assignPlan template lookup.
    PlanCatalogModule,
    // Propagates an edited plan PRICE onto the subscriptions already running on
    // that plan (`proration_behavior: 'none'` — new rate at next renewal).
    PlanPriceSyncModule,
    // Verrou d'unicité du balayage quotidien : deux instances de l'API
    // journaliseraient deux fois la même échéance.
    LocksModule,
    // #1647 — `feedback_unanswered`. La base sait ce qui a été REMONTÉ ; seul
    // `FeedbackService.listAllWithIssues` sait ce qui en a été FAIT, et rend
    // `issuesAvailable: false` quand il n'a pas pu regarder. Arête à sens unique :
    // `FeedbackModule` n'importe jamais `AdminModule`, donc aucun cycle.
    FeedbackModule,
    // #2231 — le balayage de régénération passe par
    // `EsnProfileService.regenerateProfileContext`, le même appelant que le
    // bouton « Régénérer » côté utilisateur — jamais `triggerGeneration`
    // directement. Arête à sens unique : `EsnProfileModule` n'importe jamais
    // `AdminModule`, donc aucun cycle.
    EsnProfileModule,
    MailerModule,
    // #2975 — le contrôleur des cinq leviers + la porte elle-même vivent dans
    // ce module autonome (voir son en-tête) ; `AdminModule` l'importe pour
    // enregistrer sa route, sans dupliquer sa DI.
    WorkspaceBudgetModule,
    LauraModule,
  ],
  controllers: [
    InternalAdminController,
    AdminOpsController,
    AdminQueuesController,
    AdminUsersController,
    AdminAnalysesController,
    // #AF — `POST internal/admin/segment-catchup/contacts`, le rattrapage
    // ciblé (#2543), jamais automatique.
    AdminSegmentCatchupController,
    // Point 45 (briefs comptes) — `POST internal/admin/commercial-brief-backfill`,
    // le rattrapage ciblé du brief commercial, jamais automatique.
    AdminCommercialBriefBackfillController,
    // #3917 — `POST internal/admin/group-head-backfill`, le rattrapage ciblé du lien de groupe.
    AdminGroupHeadBackfillController,
    // #2637.1 — `POST internal/admin/missing-roles-catchup`, le rattrapage
    // AUTOMATIQUE et PAYANT des rôles manquants, jamais déclenché seul.
    AdminMissingRolesCatchupController,
    // #3549 — `POST internal/admin/contact-reachability-catchup`, le rattrapage
    // GRATUIT des coordonnées manquantes, jamais déclenché seul.
    AdminContactReachabilityCatchupController,
    // #3850.1 — `POST internal/admin/contact-invalid-phone-archive`,
    // l'archivage ciblé des téléphones déjà en base invalides, jamais
    // déclenché seul.
    AdminInvalidPhoneArchiveController,
    ManualProvisioningController,
    WorkspaceOwnershipTransferController,
    BackofficeAccessJournalController,
    // #1652 — `GET internal/admin/client-health`, en lecture seule.
    AdminClientHealthController,
    // #4467 — `GET internal/admin/credit-consumption`, la consommation par espace
    // et par utilisateur, en lecture seule : le seul endroit où elle se voit.
    AdminCreditConsumptionController,
    // #2977 — `GET internal/admin/workspace-health/:workspaceId`, le score
    // INTERNE de produit (§5.6), un espace à la fois, en lecture seule.
    AdminWorkspaceHealthController,
    // #1647 — `GET internal/admin/decision-queue`, en lecture seule.
    DecisionQueueController,
    // #2231 — `GET .../profile-contexts/probability-audit` compte,
    // `POST .../profile-contexts/regenerate` rejoue (409 si le compte a bougé).
    AdminProfileContextsController,
    // #balayage-weekly-digest — `GET .../weekly-digest-sweep/audit` compte,
    // `POST .../weekly-digest-sweep` balaie (409 si le compte a bougé).
    AdminWeeklyDigestSweepController,
  ],
  // #1946.22 — décision Louis 13/09 batch 12 : la santé des espaces (#1652) est
  // lue par le passage quotidien « espace à risque » de `BackofficeAlertsModule`,
  // derrière un jeton (`CLIENT_HEALTH_READER`). La dérivation reste ICI — une
  // seule (GA-26) ; ce module l'expose, il ne la recopie nulle part.
  // `BackofficeAlertsModule` n'est importé par aucun module d'`admin/` : aucun cycle.
  exports: [AdminClientHealthService],
  providers: [
    AdminService,
    GroupHeadBackfillService,
    AdminOpsService,
    AdminQueuesService,
    AdminUsersService,
    AdminIdentityService,
    AdminAnalysesService,
    ManualProvisioningService,
    OwnerActivationService,
    // #2643.3 — l'alerte interne d'un siège toujours inactif après J+5.
    OwnerActivationSweepService,
    ManualBillingSweepService,
    AdminClientHealthService,
    AdminCreditConsumptionService,
    AdminWorkspaceHealthService,
    WorkspaceOwnershipTransferService,
    DecisionQueueService,
    AdminProfileContextsService,
    AdminWeeklyDigestSweepService,
    InternalSecretGuard,
    /**
     * #1647 — LE PLAFOND DE CRÉDITS, par jeton.
     *
     * `creditCapacity` est la seule définition de « la capacité dépensable du
     * cycle » (quota + recharge + report encore valide), et c'est celle qui
     * refuse une analyse. `credits_exhausted` dit « à plus de 90 % de son
     * enveloppe » : si son enveloppe n'était pas CELLE-LÀ, elle alerterait sur un
     * plafond que le client ne rencontre jamais. La recopier aurait oublié le
     * report — la faute exacte que `maybeNotifyCreditLow` a déjà payée.
     *
     * ⚠️ C'est une FONCTION PURE, pas un service : le jeton existe uniquement
     * parce que GA-07 compte les fichiers qui importent d'un autre module, et
     * que son second compteur est à 124 sur 124. Ce fichier-ci est un
     * `*.module.ts`, la couche que la garde exempte.
     */
    { provide: DECISION_QUEUE_CREDIT_CAPACITY, useValue: creditCapacity satisfies CreditCapacityReader },
    /**
     * #1647 — L'ÉTAT DES RETOURS, par jeton.
     *
     * ⚠️ `treated: null` n'est PAS « non traité ». Trois cas le produisent, et
     * les trois veulent dire « je n'ai pas pu regarder » :
     *  - `issuesAvailable === false` : le suivi ne répond pas, ou n'est pas
     *    branché sur cet environnement ;
     *  - le retour ne porte aucun numéro d'issue (écrit alors que le suivi était
     *    éteint) — son sort n'a jamais été enregistré nulle part ;
     *  - son numéro n'est plus dans la liste (issue supprimée, ou au-delà de la
     *    page interrogée).
     * Rendre `false` dans ces cas ferait s'allumer la file ENTIÈRE un jour de
     * panne, et une alarme toujours allumée n'est plus une alarme.
     */
    {
      provide: DECISION_QUEUE_FEEDBACK_TRACKING,
      inject: [FeedbackService],
      useFactory:
        (feedback: FeedbackService): FeedbackTrackingReader =>
        async () => {
          const { items, issuesAvailable } = await feedback.listAllWithIssues(200)
          if (!issuesAvailable) return null
          return items.map(item => ({
            id: item.id,
            category: item.category,
            createdAt: item.created_at,
            treated: item.github_issue_number == null ? null : item.issue ? item.issue.state === 'closed' : null,
          }))
        },
    },
    /**
     * La grille tarifaire de #1652, par JETON — voir `client-health-tokens.ts`.
     *
     * ⚠️ GA-07 est un cliquet AU PLAFOND, et son SECOND compteur (les fichiers
     * qui importent le service d'un autre module) est à 124 sur 124 : un
     * fichier neuf qui importerait `PlanCatalogService` ferait tomber la garde
     * quoi qu'il arrive au premier compteur. La composition se fait donc ICI,
     * dans le fichier de module, que GA-07 exempte précisément parce que c'est
     * la couche prévue pour ça. Même gabarit que #1645.
     *
     * Les prix ne sont JAMAIS recopiés : ils viennent des grilles VIVANTES du
     * catalogue, sinon l'écran mesurerait un tarif mort.
     */
    {
      provide: CLIENT_PLAN_GRIDS,
      inject: [PlanCatalogService],
      useFactory:
        (catalog: PlanCatalogService): ClientPlanGridsReader =>
        async (): Promise<ClientPlanGrids> => {
          const [priceCents, seatCents, plans] = await Promise.all([
            catalog.priceGridCents(),
            catalog.seatPriceGridCents(),
            catalog.all(),
          ])
          const seats: Record<string, number> = {}
          const labels: Record<string, string> = {}
          for (const plan of plans) {
            seats[plan.key] = plan.seats
            labels[plan.key] = plan.label
          }
          return { priceCents, seatCents, seats, labels }
        },
    },
  ],
})
export class AdminModule {}
