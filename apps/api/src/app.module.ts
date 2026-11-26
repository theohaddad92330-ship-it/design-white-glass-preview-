import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ThrottlerModule } from '@nestjs/throttler'
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis'
import { BullModule } from '@nestjs/bullmq'
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import { SentryModule } from '@sentry/nestjs/setup'
import IORedis from 'ioredis'
import { UserThrottlerGuard } from './common/user-throttler.guard'
import { envConfig } from './config/env.config'
import { bullConnectionOptions, parseRedisUrl } from './config/redis-connection'
import { CorrelationIdModule } from './correlation-id/correlation-id.module'
import { PerfModule } from './perf/perf.module'
import { DatabaseModule } from './database/database.module'
import { GlobalExceptionFilter } from './common/global-exception.filter'
import { SentryCorrelationInterceptor } from './sentry/sentry-correlation.interceptor'
import { SupabaseModule } from './supabase/supabase.module'
import { IaModule } from './modules/ia/ia.module'
import { AuthModule } from './modules/auth/auth.module'
import { ProfilesModule } from './modules/profiles/profiles.module'
import { ProfileContextModule } from './modules/profile-context/profile-context.module'
import { OnboardingModule } from './modules/onboarding/onboarding.module'
import { EsnProfileModule } from './modules/esn-profile/esn-profile.module'
import { AccountFeedbackModule } from './modules/account-feedback/account-feedback.module'
import { IntroductionsModule } from './modules/introductions/introductions.module'
import { MessageDraftsModule } from './modules/message-drafts/message-drafts.module'
import { ScheduledSendModule } from './modules/scheduled-send/scheduled-send.module'
import { AccountsModule } from './modules/accounts/accounts.module'
import { AccountFollowsModule } from './modules/account-follows/account-follows.module'
import { SignalLibraryModule } from './modules/signal-library/signal-library.module'
import { WeakestLinkDiagnosisModule } from './modules/weakest-link-diagnosis/weakest-link-diagnosis.module'
import { ConsultantsModule } from './modules/consultants/consultants.module'
import { PilotageModule } from './modules/pilotage/pilotage.module'
import { AccountEntitiesModule } from './modules/account-entities/account-entities.module'
import { AccountGateModule } from './modules/account-gate/account-gate.module'
import { CapitalisationModule } from './modules/capitalisation/capitalisation.module'
import { SharedBaseModule } from './modules/shared-base/shared-base.module'
import { AccountAccessModule } from './modules/account-access/account-access.module'
import { DataforgeModule } from './modules/dataforge/dataforge.module'
import { MarketMemoryModule } from './modules/market-memory/market-memory.module'
import { MarketMemoryGroundTruthModule } from './modules/market-memory-ground-truth/market-memory-ground-truth.module'
import { EsnDirectoryModule } from './modules/esn-directory/esn-directory.module'
import { PartnerPipelineModule } from './modules/partner-pipeline/partner-pipeline.module'
import { PartnerCvPushModule } from './modules/partner-cv-push/partner-cv-push.module'
import { PartnersModule } from './modules/partners/partners.module'
import { ExternalSourcingModule } from './modules/external-sourcing/external-sourcing.module'
import { QualificationLeadsModule } from './modules/qualification-leads/qualification-leads.module'
import { SprintsModule } from './modules/sprints/sprints.module'
import { CataloguesModule } from './modules/catalogues/catalogues.module'
import { LegalEntitiesModule } from './modules/legal-entities/legal-entities.module'
import { ProjectsModule } from './modules/projects/projects.module'
import { OutcomesModule } from './modules/outcomes/outcomes.module'
import { CompaniesModule } from './modules/companies/companies.module'
import { ContactsModule } from './modules/contacts/contacts.module'
import { ContactDiscoveryModule } from './modules/contact-discovery/contact-discovery.module'
import { CoverageModule } from './modules/coverage-gaps/coverage.module'
import { AssignmentModule } from './modules/assignment/assignment.module'
import { AnalysisModule } from './modules/analysis/analysis.module'
import { ChatDeepenJobsModule } from './modules/chat-deepen-jobs/chat-deepen-jobs.module'
import { ChatDeepenAutoResumeModule } from './modules/chat-deepen-auto-resume/chat-deepen-auto-resume.module'
import { ChangelogNewsletterModule } from './modules/changelog-newsletter/changelog-newsletter.module'
import { CreditsModule } from './modules/credits/credits.module'
import { ContactStopModule } from './modules/contact-stop/contact-stop.module'
import { TeamGuardrailsModule } from './modules/team-guardrails/team-guardrails.module'
import { CrmSyncModule } from './modules/crm-sync/crm-sync.module'
import { CrmWebhooksModule } from './modules/crm-webhooks/crm-webhooks.module'
import { CrmModule } from './modules/crm/crm.module'
import { CrmMirrorModule } from './modules/crm-mirror/crm-mirror.module'
import { SalesforceModule } from './modules/salesforce/salesforce.module'
import { AgendaModule } from './modules/agenda/agenda.module'
import { BriefingModule } from './modules/briefing/briefing.module'
import { AdminDocsModule } from './modules/admin-docs/admin-docs.module'
import { AtsModule } from './modules/ats/ats.module'
import { MeetingNotesModule } from './modules/meeting-notes/meeting-notes.module'
import { LinkedInModule } from './modules/linkedin/linkedin.module'
import { TelephonyModule } from './modules/telephony/telephony.module'
import { LemlistModule } from './modules/lemlist/lemlist.module'
import { DocumentsModule } from './modules/documents/documents.module'
import { BaseReaderModule } from './modules/base-reader/base-reader.module'
import { CopilotBridgeModule } from './modules/copilot-bridge/copilot-bridge.module'
import { LauraModule } from './modules/laura/laura.module'
import { RoutinesModule } from './modules/routines/routines.module'
import { AutomationRulesModule } from './modules/automation-rules/automation-rules.module'
import { GoogleModule } from './modules/google/google.module'
import { MailboxModule } from './modules/mailbox/mailbox.module'
import { OdooModule } from './modules/odoo/odoo.module'
import { BeeperModule } from './modules/beeper/beeper.module'
import { PipedriveModule } from './modules/pipedrive/pipedrive.module'
import { ZohoModule } from './modules/zoho/zoho.module'
import { NotionModule } from './modules/notion/notion.module'
import { MicrosoftModule } from './modules/microsoft/microsoft.module'
import { AttioModule } from './modules/attio/attio.module'
import { IntegrationsModule } from './modules/integrations/integrations.module'
import { ImportModule } from './modules/import/import.module'
import { UniversalImportModule } from './modules/universal-import/universal-import.module'
import { ToolRegistryModule } from './modules/tool-registry/tool-registry.module'
import { IntegrationSyncModule } from './modules/integration-sync/integration-sync.module'
import { ActionsModule } from './modules/actions/actions.module'
import { ActionOsModule } from './modules/action-os/action-os.module'
import { ChainsModule } from './modules/chains/chains.module'
import { DeliveryModule } from './modules/delivery/delivery.module'
import { PaymentsModule } from './modules/payments/payments.module'
// #2565 — créer la facture PRÉPARÉE dans l'outil de gestion branché par le
// client. Module autonome, même motif que `PaymentsModule` juste après : il
// LIT `invoice_readiness` en repository et n'importe aucun service de
// `DeliveryModule`, qui se déclare lui-même sans dépendance à la facture légale.
import { InvoiceConnectorModule } from './modules/invoice-connector/invoice-connector.module'
import { AdvModule } from './modules/adv/adv.module'
import { RfpModule } from './modules/rfp/rfp.module'
import { ProposalsModule } from './modules/proposals/proposals.module'
import { ActionRouterModule } from './modules/action-router/action-router.module'
import { OutreachModule } from './modules/outreach/outreach.module'
import { SequenceTemplatesModule } from './modules/sequence-templates/sequence-templates.module'
import { OutreachTemplatesModule } from './modules/outreach-templates/outreach-templates.module'
import { UserAnglesModule } from './modules/user-angles/user-angles.module'
import { CommercialAuditFeedbackModule } from './modules/commercial-audit-feedback/commercial-audit-feedback.module'
import { ExpertiseGroundingsModule } from './modules/expertise-groundings/expertise-groundings.module'
import { ProspectingSessionsModule } from './modules/prospecting-sessions/prospecting-sessions.module'
import { MessageStyleModule } from './modules/message-style/message-style.module'
import { MarketBriefModule } from './modules/market-brief/market-brief.module'
import { QualificationGridModule } from './modules/qualification-grid/qualification-grid.module'
import { MessageLibraryModule } from './modules/message-library/message-library.module'
import { FeedbackModule } from './modules/feedback/feedback.module'
import { HealthModule } from './modules/health/health.module'
import { OutboxModule } from './modules/outbox/outbox.module'
import { RagModule } from './modules/rag/rag.module'
import { IaProxyModule } from './modules/ia-proxy/ia-proxy.module'
import { ReflagModule } from './modules/reflag/reflag.module'
import { StripeModule } from './modules/stripe/stripe.module'
import { DashboardModule } from './modules/dashboard/dashboard.module'
import { MailerModule } from './modules/mailer/mailer.module'
import { AdminModule } from './modules/admin/admin.module'
import { SupervisionModule } from './modules/supervision/supervision.module'
import { AuditJournalModule } from './modules/admin/audit-journal.module'
import { DemoModule } from './modules/demo/demo.module'
import { BannersModule } from './modules/banners/banners.module'
import { BackofficeModule } from './modules/backoffice/backoffice.module'
import { InternalKnowledgeModule } from './modules/internal-knowledge/internal-knowledge.module'
import { LogoModule } from './modules/logo/logo.module'
import { NotificationsModule } from './modules/notifications/notifications.module'
import { OAuthModule } from './modules/oauth/oauth.module'
import { McpApiModule } from './modules/mcp-api/mcp-api.module'
import { ApiKeysModule } from './modules/api-keys/api-keys.module'
import { McpAccessIntentsModule } from './modules/mcp-access-intents/mcp-access-intents.module'
import { PublicApiModule } from './modules/public-api/public-api.module'
import { WorkspaceModule } from './modules/workspace/workspace.module'
import { ManagerModule } from './modules/manager/manager.module'
import { ObjectivesModule } from './modules/objectives/objectives.module'
import { TargetListsModule } from './modules/target-lists/target-lists.module'
import { AnalysisBatchesModule } from './modules/analysis-batches/analysis-batches.module'
import { BusinessUnitModule } from './modules/business-unit/business-unit.module'
import { WorkspaceJoinModule } from './modules/workspace-join/workspace-join.module'
import { WorkspaceMergeModule } from './modules/workspace-merge/workspace-merge.module'
import { TeamCommentsModule } from './modules/team-comments/team-comments.module'
import { TeamResearchModule } from './modules/team-research/team-research.module'
import { WorkContextsModule } from './modules/work-contexts/work-contexts.module'
import { ContextContractModule } from './modules/context-contract/context-contract.module'
import { ActivitiesModule } from './modules/activities/activities.module'
import { TasksModule } from './modules/tasks/tasks.module'
import { PlaybooksModule } from './modules/playbooks/playbooks.module'
import { CrmCoreModule } from './modules/crm-core/crm-core.module'
import { PipelineDetectionsModule } from './modules/pipeline-detections/pipeline-detections.module'
import { DiscoverNotesModule } from './modules/discover-notes/discover-notes.module'
import { LibraryModule } from './modules/library/library.module'
import { OutreachAssetModule } from './modules/outreach-assets/outreach-asset.module'
import { MemoryModule } from './modules/memory/memory.module'
import { AnalyticsModule } from './modules/analytics/analytics.module'
import { BusinessMetricsModule } from './modules/business-metrics/business-metrics.module'
import { BackofficeAlertsModule } from './modules/backoffice-alerts/backoffice-alerts.module'
import { ChatEvalSamplingModule } from './modules/chat-eval-sampling/chat-eval-sampling.module'
import { LauraUnroutedIntentsModule } from './modules/laura-unrouted-intents/laura-unrouted-intents.module'
import { PrivacyModule } from './modules/privacy/privacy.module'
import { WatchlistRefreshModule } from './modules/watchlist-refresh/watchlist-refresh.module'
import { WatchlistRulesModule } from './modules/watchlist-rules/watchlist-rules.module'
import { ImpersonationModule } from './modules/impersonation/impersonation.module'
import { WorkerReadinessModule } from './modules/worker-readiness/worker-readiness.module'
import { FactoringModule } from './modules/factoring/factoring.module'
import { ExpensesModule } from './modules/expenses/expenses.module'
import { StorageModule } from './modules/storage/storage.module'

@Module({
  imports: [
    // #2160.9 / #4504.3 — AssignmentModule (`PATCH /contacts/assign`) en TÊTE : une dizaine de modules importent
    // CrmCoreModule, dont `PATCH /contacts/:id` (corps strict) captait « assign » (400 en prod depuis #944).
    // L'ordre réel est un parcours en profondeur ; GA-178 suit les imports transitifs. Revient sur b93fb9c698.
    AssignmentModule,
    SentryModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      load: [envConfig],
    }),
    ThrottlerModule.forRootAsync({
      // Single global throttler, 120 req/min PAR UTILISATEUR (par IP pour un
      // visiteur anonyme) — voir `UserThrottlerGuard`.
      //
      // Deux corrections tirées d'un incident : le compteur était par IP seule,
      // donc une équipe derrière un même NAT se partageait 60 requêtes par
      // minute ; et 60 ne suffit pas à l'écran de suivi d'analyse, qui poll
      // pendant trois à six minutes en plus du trafic normal de l'application.
      // Un dépassement n'était pas anodin : il déconnectait le commercial et
      // l'enfermait sur l'écran « Oups ».
      //
      // Cost-sensitive limits (e.g. "max 5 analyses per hour") are NOT enforced
      // here: a per-route `@Throttle` override would share this Redis counter
      // and a normal page load would burn the analysis quota in seconds.
      // Those quotas live in the service layer (see AnalysisService.start)
      // where they can use a dedicated counter and surface domain-specific
      // failure codes.
      useFactory: () => ({
        throttlers: [{ name: 'default-1m', ttl: 60_000, limit: 120 }],
        storage: new ThrottlerStorageRedisService(new IORedis({ ...parseRedisUrl(), maxRetriesPerRequest: null })),
      }),
    }),
    // Reconnecting BullMQ connection (maxRetriesPerRequest: null + a
    // reconnect-forever retryStrategy) so a Redis blip never permanently wedges
    // the analysis worker — see bullConnectionOptions().
    BullModule.forRoot({ connection: bullConnectionOptions() }),
    // Global registry the analysis worker reports its liveness to and the
    // `/health/ready` deploy gate reads — decoupled from both modules.
    WorkerReadinessModule,
    CorrelationIdModule,
    PerfModule,
    DatabaseModule,
    SupabaseModule,
    // Feature flags (Reflag). Global + fail-open: without REFLAG_SECRET_KEY
    // every flag evaluates to false, so this is a no-op until configured.
    ReflagModule,
    IaModule,
    AuthModule,
    ProfilesModule,
    ProfileContextModule,
    OnboardingModule,
    EsnProfileModule,
    // n°20 (30/08/2026) : AccountAccessModule DOIT être importé avant
    // AccountsModule. Nest/Express enregistrent les routes dans l'ordre des
    // modules ; `AccountsController` déclare `@Get(':id')` sans distinguer les
    // segments, et un `:id` enregistré en premier capture n'importe quelle
    // route LITTÉRALE à un segment déclarée après lui sous le même préfixe
    // `accounts` — c'est arrivé à `@Get('access-summary')`
    // (`account-access.controller.ts`), qui finissait en
    // `WHERE a.id = 'access-summary'` côté SQL (500 « invalid input syntax for
    // type uuid »). GA-178 (`apps/api/src/architecture/`) vérifie cet ordre en
    // continu ; `ParseUUIDPipe` sur `accounts.controller.ts` est la ceinture,
    // pas le correctif — voir son commentaire.
    //
    // Vérifié le 30/08/2026 : aucune des SEPT autres routes du préfixe
    // `accounts` enregistrées après `AccountsModule` (coverage-gaps, partners,
    // account-entities, account-gate, crm-core, assignment, account-feedback)
    // ne porte de route littérale à UN segment — toutes vivent sous `:id/...`
    // (deux segments ou plus), donc aucune n'est aujourd'hui capturée. Elles
    // restent hors de ce déplacement ; GA-178 fera rougir la CI le jour où
    // l'une d'elles en gagnerait une sans être réordonnée.
    AccountAccessModule,
    AccountsModule,
    // #4267 — « Suivre » un compte (routes `accounts/:id/follow`, deux segments : après AccountsModule, GA-178).
    AccountFollowsModule,
    SignalLibraryModule,
    WeakestLinkDiagnosisModule,
    CompaniesModule,
    ContactsModule,
    ContactDiscoveryModule,
    CoverageModule,
    AnalysisModule,
    ChatDeepenJobsModule,
    ChatDeepenAutoResumeModule,
    AccountEntitiesModule,
    AccountGateModule,
    CapitalisationModule,
    // P05 (#3246) — la base anonyme commune : son job nocturne doit être MONTÉ (GA-77).
    SharedBaseModule,
    DataforgeModule,
    MarketMemoryModule,
    MarketMemoryGroundTruthModule,
    EsnDirectoryModule,
    PartnerPipelineModule,
    PartnerCvPushModule,
    PartnersModule,
    ExternalSourcingModule,
    QualificationLeadsModule,
    SprintsModule,
    CataloguesModule,
    LegalEntitiesModule,
    ProjectsModule,
    OutcomesModule,
    ConsultantsModule,
    PilotageModule,
    CreditsModule,
    CrmModule,
    CrmMirrorModule,
    // Synchronisation CRM dans les deux sens (§58, P1-07). Module autonome :
    // le retirer supprime le passage quotidien, pas la lecture ni l'export.
    ContactStopModule,
    TeamGuardrailsModule,
    CrmSyncModule,
    // #4189.7 — webhooks entrants HubSpot / Salesforce (signés) → synchro ciblée.
    CrmWebhooksModule,
    SalesforceModule,
    GoogleModule,
    MailboxModule,
    AgendaModule,
    BriefingModule,
    LauraModule,
    RoutinesModule,
    // Lot L-D1 (#4167) — les automatisations « quand signal → alors … ».
    AutomationRulesModule,
    CopilotBridgeModule,
    // #4792 (épopée #4791) — le lecteur commun de la base : UNE lecture, quatre surfaces.
    BaseReaderModule,
    AtsModule,
    AdminDocsModule,
    MeetingNotesModule,
    LinkedInModule,
    TelephonyModule,
    LemlistModule,
    DocumentsModule,
    OdooModule,
    // #4406 — Beeper Desktop de l'utilisateur (lecture en direct, envoi par la porte).
    BeeperModule,
    PipedriveModule,
    ZohoModule,
    NotionModule,
    MicrosoftModule,
    AttioModule,
    IntegrationsModule,
    ImportModule,
    UniversalImportModule,
    ToolRegistryModule,
    IntegrationSyncModule,
    ActionsModule,
    ActionRouterModule,
    ActionOsModule,
    RfpModule,
    ProposalsModule,
    DeliveryModule,
    // Les paiements SORTANTS vers le consultant (31/08/2026) — le miroir de la
    // facturation client du Delivery OS. Module autonome : il LIT trois tables
    // du delivery en SQL et n'importe aucun de ses services.
    PaymentsModule,
    InvoiceConnectorModule,
    // Administration des ventes (31/08/2026) — APRÈS `DeliveryModule`, dont il
    // lit les fenêtres de renouvellement.
    AdvModule,
    ChainsModule,
    OutreachModule,
    SequenceTemplatesModule,
    OutreachTemplatesModule,
    UserAnglesModule,
    CommercialAuditFeedbackModule,
    // Épopée #2880 (lot V33) — le croisement expertise ↔ fondement/preuve.
    ExpertiseGroundingsModule,
    ProspectingSessionsModule,
    MessageStyleModule,
    MessageLibraryModule,
    MarketBriefModule,
    // #3755 — la grille de qualification propre à l'espace.
    QualificationGridModule,
    FeedbackModule,
    AccountFeedbackModule,
    IntroductionsModule,
    MessageDraftsModule,
    // Théo M2 — envoi programmé : le geste du commercial (valider + programmer), décalé dans le temps.
    ScheduledSendModule,
    HealthModule,
    OutboxModule,
    RagModule,
    IaProxyModule,
    LibraryModule,
    OutreachAssetModule,
    MemoryModule,
    AnalyticsModule,
    // Les chiffres de BELLUM (#1645, #1649) — lecture seule sur les abonnements
    // et les contrats sur facture ; aucun chemin d'écriture vers la facturation.
    BusinessMetricsModule,
    // #1676.1 — le dispatcheur d'alertes du back-office. Sans cette ligne, ni son
    // controleur ni son cron n'existent : GA-77 le refuse, et c'est elle qui a
    // rattrape l'oubli (le module etait ecrit, teste, et atteint par personne).
    BackofficeAlertsModule,
    // #1949.23 — la trace anonyme des demandes que Laura n'a pas su router, et sa
    // lecture agrégée pour le back-office. Aussi importé par `IaProxyModule`, qui
    // l'écrit après un tour de chat.
    LauraUnroutedIntentsModule,
    ChatEvalSamplingModule,
    StripeModule,
    DashboardModule,
    MailerModule,
    AdminModule,
    // Supervision de l'infra (Grafana Cloud Prometheus, no-op sans clé) — lue
    // par le back-office seulement, derrière InternalSecretGuard.
    SupervisionModule,
    // Le journal d'audit unique du back-office (#1666). Monté ICI et pas
    // seulement via `AdminModule` : il porte sa PROPRE purge de rétention
    // (@Cron 04:37) et son contrôleur, et GA-77 exige qu'un hôte de tâche
    // planifiée soit atteint par `AppModule`. `BackofficeAccessJournalModule`
    // l'importe de son côté pour y miroiter ses entrées.
    AuditJournalModule,
    // Registered explicitly (not only through AdminModule) because it now owns
    // the public /demo controller — the shared demo link.
    DemoModule,
    BannersModule,
    // Une seule route : l'adresse de la console d'exploitation, servie au seul
    // porteur du rôle `backoffice` (décision Louis 28/08/2026).
    BackofficeModule,
    // #3586 — le Drive interne → corpus RAG partagé (cron 10 min, no-op sans clé).
    InternalKnowledgeModule,
    LogoModule,
    NotificationsModule,
    OAuthModule,
    McpApiModule,
    ApiKeysModule,
    McpAccessIntentsModule,
    PublicApiModule,
    WorkspaceModule,
    ManagerModule,
    ObjectivesModule,
    // #2155.13 — « Mes cibles ».
    TargetListsModule,
    // #2293.5 — le lot d'analyses multi-comptes (job parent + sous-jobs).
    AnalysisBatchesModule,
    BusinessUnitModule,
    // #2016 — rejoindre un espace existant (demande d'accès d'un non-membre).
    WorkspaceJoinModule,
    // #4158.57 — rapatrier l'espace personnel dans l'espace ESN rejoint (aperçu figé, double validation).
    WorkspaceMergeModule,
    TeamCommentsModule,
    TeamResearchModule,
    // #2455 — contextes de travail enregistrés (LAU-FINAL-168).
    WorkContextsModule,
    // #2454 — contrat de contexte de Découvrir / Analyser (LAU-FINAL-167).
    ContextContractModule,
    CrmCoreModule,
    // #4016 L6 — le pipe « détecté, à revoir ».
    PipelineDetectionsModule,
    // #2151.59 — notes de terrain sur un candidat Découvrir, avant qu'il ne
    // devienne un compte (AVANT AccountsModule : la reprise à la conversion
    // lit ce module depuis `AccountsService.create`).
    DiscoverNotesModule,
    ActivitiesModule,
    TasksModule,
    PlaybooksModule,
    PrivacyModule,
    WatchlistRefreshModule,
    WatchlistRulesModule,
    ChangelogNewsletterModule,
    ImpersonationModule,
    // La CESSION de créance / affacturage (31/08/2026). Préfixe de route
    // `factoring`, neuf, donc aucune route littérale ne peut être capturée par
    // un `:id` d'un autre module (GA-178).
    FactoringModule,
    // LES NOTES DE FRAIS (31/08/2026). Son préfixe `expenses/reports` ne
    // recoupe aucun autre contrôleur : Nest ordonne ses routes par MODULE et
    // non par spécificité, et une route littérale capturée par le `:id` d'un
    // autre module rend 500 en production sans qu'aucun test local ne le voie.
    ExpensesModule,
    // LE STOCKAGE DE FICHIERS (31/08/2026). Aucun contrôleur, donc aucune route
    // — un fichier s'ouvre TOUJOURS par la porte de son objet parent, qui est
    // ce qui porte le droit de lecture. Il est monté ici pour que sa purge de
    // rétention TOURNE : une tâche planifiée dont le module n'est pas atteint
    // depuis `AppModule` ne s'exécute jamais, et rien ne le dit (GA-77).
    StorageModule,
  ],
  providers: [
    // Single global filter: logs (→ Winston → Sentry via transport) then delegates
    // response formatting to Nest. Replaces Sentry's own filter to avoid double capture.
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: SentryCorrelationInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: UserThrottlerGuard,
    },
  ],
})
export class AppModule {}
