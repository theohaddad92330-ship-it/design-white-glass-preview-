import { Global, Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ContactEntity } from '../../database/entities/contact.entity'
import { CreditLedgerEntity } from '../../database/entities/credit-ledger.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { ProductEventEntity } from '../../database/entities/product-event.entity'
import { ProviderCostEntity } from '../../database/entities/provider-cost.entity'
import { EnrichmentDurationSampleEntity } from '../../database/entities/enrichment-duration-sample.entity'
import { ChatTurnCostSampleEntity } from '../../database/entities/chat-turn-cost-sample.entity'
import { OutreachTransitionEntity } from '../../database/entities/outreach-transition.entity'
import { OutreachMessageVersionEntity } from '../../database/entities/outreach-message-version.entity'
import { OutreachMessageEntity } from '../../database/entities/outreach-message.entity'
import { ContactStopEntity } from '../../database/entities/contact-stop.entity'
import { MessageLearningRuleProposalSnapshotEntity } from '../../database/entities/message-learning-rule-proposal-snapshot.entity'
import { OutreachSequenceEntity } from '../../database/entities/outreach-sequence.entity'
import { WorkflowRunEntity } from '../../database/entities/workflow-run.entity'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { PlanCatalogModule } from '../credits/plan-catalog.module'
import { LocksModule } from '../locks/locks.module'
import { AnalyticsController } from './analytics.controller'
import { AnalyticsOverviewService } from './analytics-overview.service'
import { ChatbotFunnelService } from './chatbot-funnel.service'
import { CostAlertService } from './cost-alert.service'
import { EnrichmentCoverageService } from './enrichment-coverage.service'
import { EnrichmentDurationService } from './enrichment-duration.service'
import { ChatTurnCostEstimateService } from './chat-turn-cost-estimate.service'
import { ObservabilityAlertsService } from './observability-alerts.service'
import { AnalysisRunEntity } from '../../database/entities/analysis-run.entity'
import { InternalTeamKpisController } from './internal-team-kpis.controller'
import { ProductAnalyticsService } from './product-analytics.service'
import { RoutineSubscriptionEntity } from '../../database/entities/routine-subscription.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { QualityMetricsService } from './quality-metrics.service'
import { ProviderCostRecorder } from './provider-cost-recorder'
import { ProviderCostService } from './provider-cost.service'
import { TeamKpisService } from './team-kpis.service'
import { ToolRegistryModule } from '../tool-registry/tool-registry.module'
import { CrmKpisService } from './crm-kpis.service'
import { AccountEntity } from '../../database/entities/account.entity'
import { ManagerKpiService } from './manager-kpi.service'
import { PlausibleChatbotClient } from './plausible-chatbot.client'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { RetentionCohortsService } from './retention-cohorts.service'
import { InternalOnboardingFunnelController } from './internal-onboarding-funnel.controller'
import { InternalProductAnalyticsController } from './internal-product-analytics.controller'
import { InternalReasoningQualityController } from './internal-reasoning-quality.controller'
import { ReasoningQualityService } from './reasoning-quality.service'
import { InternalReplyContestationsController } from './internal-reply-contestations.controller'
import { ReplyContestationsService } from './reply-contestations.service'
import { ChatReplyFeedbackEntity } from '../../database/entities/chat-reply-feedback.entity'
import { ReasoningJudgeSamplingService } from './reasoning-judge-sampling.service'
import { OnboardingFunnelService } from './onboarding-funnel.service'
import { ProductAnalyticsReadService } from './product-analytics-read.service'
import { WorkspaceModule } from '../workspace/workspace.module'
import { MessageLearningController } from './message-learning.controller'
import { MessageLearningSignalsService } from './message-learning-signals.service'
import { ActionOsAdoptionMetricsService } from './action-os-adoption-metrics.service'
import { InternalFeatureAdoptionController } from './internal-feature-adoption.controller'
import { FeatureAdoptionUsageService } from './feature-adoption-usage.service'
import { PLAN_CATALOG_PORT, type PlanCatalogPort } from './plan-catalog.port'
import { PlanCatalogService } from '../credits/plan-catalog.service'

/**
 * Self-hosted product analytics.
 *
 * `@Global` so every feature service can inject {@link ProductAnalyticsService}
 * to emit best-effort events WITHOUT its own module having to import this one
 * (and without a signature change rippling through every consumer's test setup —
 * consumers inject it `@Optional()`, so removing this module degrades analytics
 * to a no-op rather than breaking the app).
 *
 * The overview read path (`AnalyticsOverviewService` + controller) stays private
 * to this module.
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProductEventEntity,
      ProviderCostEntity,
      // #2120.57 / #2297.23 — mesures de durée d'enrichissement (anonymes,
      // agrégées tous espaces confondus). Un repository injecté doit être
      // DÉCLARÉ ici (GA-20) : sans cette ligne, le graphe ne tombe qu'au
      // démarrage.
      EnrichmentDurationSampleEntity,
      // #2448.8 / #2882.11 (épopée #2882) — mesures anonymes durée/coût d'un tour
      // de chat, PAR PALIER. Un repository injecté doit être DÉCLARÉ ici (GA-20).
      ChatTurnCostSampleEntity,
      UserActionEntity,
      RoutineSubscriptionEntity,
      // Lecture seule : la couverture d'enrichissement lit une trace déjà écrite
      // par le module contacts, elle ne possède pas la table.
      ContactEntity,
      AccountEntity,
      // Lecture seule : les alertes d'observabilité lisent la vraie machine à
      // états des runs (latence, échec, absence d'issue) — elles n'écrivent
      // jamais dedans, et le module analysis reste propriétaire de la table.
      AnalysisRunEntity,
      // Lecture seule elle aussi : le DÉNOMINATEUR du coût d'un crédit. Le
      // module credits possède la table et l'écrit ; l'alerte de coûts ne fait
      // que la lire pour répondre à « un crédit vaut-il partout la même
      // chose ? ». Un repository injecté doit être DÉCLARÉ ici (GA-20) : sans
      // cette ligne, le graphe ne tombe qu'au démarrage.
      CreditLedgerEntity,
      // #2442.10 (lot W9) — lecture seule : l'agrégat des contestations de Laura, par fonction (c64, 3e exception, GA-412).
      ChatReplyFeedbackEntity,
      // Lecture seule elle aussi : les cinq indicateurs manager qui manquaient
      // (`manager-kpi.service.ts`) lisent l'inscription (`profiles.created_at`)
      // pour bâtir leurs cohortes J+30 / rétention à 3 mois. Le module `auth`
      // possède la table ; ce service ne fait qu'y lire un repository DÉCLARÉ
      // ici (GA-20) — sans cette ligne, le graphe ne tombe qu'au démarrage.
      ProfileEntity,
      // Lecture seule elle aussi : la rétention par cohorte (#1658.1) lit
      // `workspaces.created_at` pour bâtir le DÉNOMINATEUR de chaque cohorte
      // mensuelle — l'unité d'analyse est l'ESPACE, jamais la personne
      // (doctrine `c64_analytique_produit`). Le module `workspaces` possède la
      // table ; un repository injecté doit être DÉCLARÉ ici (GA-20), sans quoi
      // le graphe ne tombe qu'au démarrage.
      WorkspaceEntity,
      // Lecture seule elle aussi : #2385.2 (épopée #2877) classe en signal
      // EXPRESS de learning une transition que le module `outreach` possède
      // et écrit déjà (`outreach_transitions`, #2366.8). Un repository injecté
      // doit être DÉCLARÉ ici (GA-20) : sans cette ligne, le graphe ne tombe
      // qu'au démarrage.
      OutreachTransitionEntity,
      OutreachMessageVersionEntity,
      // #2385.3 (LOT écrivain 28/09) — `optOut`/`meetingBooked` REJOIGNENT le
      // CONTACT de chaque message (`outreach_messages`, module `outreach`)
      // puis son arrêt éventuel (`contact_stops`, module `contact-stop`) —
      // `UserActionEntity` (`user_actions`) est déjà déclarée ci-dessus. Deux
      // repositories injectés DIRECTEMENT (GA-07 ne compte pas les
      // repositories, voir `module-boundaries.spec.ts`), déclarés ici (GA-20).
      OutreachMessageEntity,
      ContactStopEntity,
      // #2385.5 (LOT écrivain 28/09, passe 2) — la persistance versionnée du
      // candidat de règle workspace, DÉCLARÉE ici (GA-20) comme les autres
      // repositories de ce service.
      MessageLearningRuleProposalSnapshotEntity,
      // #2385.5 (LOT écrivain 28/09, passe 2) — le niveau CAMPAGNE lit
      // `outreach_sequences.campaign_label`, DÉCLARÉE ici (GA-20).
      OutreachSequenceEntity,
      // #2442.13 (épopée #2879) — action validée/exécutée/premier succès PAR
      // ESPACE. Lecture seule sur `workflow_runs` (module `action-os`, qui en
      // reste propriétaire) ; `approval_requests` n'a pas de repository propre
      // à ce service (SQL brut via `.manager.query`, même patron que
      // `manager-kpi.service.ts::validatedActionCadence`, sa version globale).
      // Un repository injecté doit être DÉCLARÉ ici (GA-20) : sans cette
      // ligne, le graphe ne tombe qu'au démarrage.
      WorkflowRunEntity,
    ]),
    PlanCatalogModule,
    // #2877 — `MessageLearningController` résout l'espace actif depuis le token.
    WorkspaceModule,
    // Le jeu de recette du copilote lit l'état RÉEL des connecteurs pour
    // distinguer « bloqué » (configuration) de « à jouer ».
    ToolRegistryModule,
    // Le verrou du passage de 07:05. `CostAlertService` APPELAIT déjà
    // `withSingletonLock`, mais `LocksModule` n'était importé nulle part ici :
    // l'injection étant `@Optional()`, Nest résolvait `undefined`, et le helper
    // dégradait silencieusement en exécution DIRECTE, SANS lever. Le verrou
    // existait donc en toutes lettres et ne verrouillait rien — l'alerte de coût
    // et les quatre alertes d'observabilité partaient une fois PAR RÉPLIQUE,
    // tous les matins. Et une alerte en triple s'ignore aussi vite qu'une
    // alerte fausse.
    //
    // Motif n°1 du dépôt : l'appel est écrit, la dépendance n'est pas déclarée.
    //
    // ⚠️ DEUX lots l'ont trouvé la même nuit, séparément, et chacun a posé sa
    //    garde — elles ne disent pas la même chose et se complètent :
    //    · GA-69 : un service qui appelle `withSingletonLock` vit dans un module
    //      qui DÉCLARE `LocksModule` (le trou exact d'ici) ;
    //    · GA-76 : toute tâche planifiée a un verrou câblé OU une raison écrite
    //      de ne pas en avoir (les six tâches légitimement sans verrou).

    LocksModule,
  ],
  controllers: [
    AnalyticsController,
    // #2877 — l'écran agrégat d'apprentissage des messages, lu par l'espace.
    MessageLearningController,
    InternalTeamKpisController,
    InternalOnboardingFunnelController,
    InternalProductAnalyticsController,
    // #1685 — l'usage réel de chaque fonction gatée, agrégé PAR FONCTION à
    // travers tous les espaces. Fichier séparé pour la même raison que ses
    // trois voisins ci-dessus : plusieurs lots touchent `analytics/` en
    // parallèle.
    InternalFeatureAdoptionController,
    // #3223.3 — le raisonnement commercial de Laura, lu sur le trafic réel.
    InternalReasoningQualityController,
    // #2442.10 (lot W9) — contestations de Laura par fonction.
    InternalReplyContestationsController,
  ],
  providers: [
    ReasoningQualityService,
    ReplyContestationsService,
    // #3223 (décision Louis 11/10/2026) — l'échantillon quotidien du juge « recommandation générique ».
    ReasoningJudgeSamplingService,
    CrmKpisService,
    QualityMetricsService,
    ProductAnalyticsService,
    AnalyticsOverviewService,
    TeamKpisService,
    InternalSecretGuard,
    ProviderCostService,
    ProviderCostRecorder,
    // #2120.57 / #2297.23 — la durée d'un enrichissement se mesure et
    // s'estime (médiane des 50 dernières, `null` sous 5 — GA-18/19).
    EnrichmentDurationService,
    // #2448.8 / #2882.11 (épopée #2882) — coût et durée d'un tour Vérifié/Approfondi
    // s'estiment sur les mesures RÉELLES du même palier (même patron que
    // `EnrichmentDurationService` ci-dessus), `null` sous 5 mesures (GA-18/19).
    ChatTurnCostEstimateService,
    // Le registre des coûts existe depuis le 03/08 ; personne n'en était
    // PRÉVENU. Sans seuil déclaré, ce service ne lit rien et ne dit rien.
    CostAlertService,
    // Les quatre autres alertes exigées de l'observabilité (latence, erreur,
    // hallucination, no-outcome). Elles étaient CALCULÉES depuis des semaines —
    // et lisibles au seul back-office : personne n'en était PRÉVENU.
    ObservabilityAlertsService,
    EnrichmentCoverageService,
    // Les cinq indicateurs manager qui manquaient (cohorte J+30, rétention 3
    // mois, marge brute de Bellum, cadence d'actions validées, consultants par
    // commercial) — back-office uniquement, même arbitrage que les coûts.
    ManagerKpiService,
    // Le tunnel et les deux A/B du chatbot public (chantier n°1, §11). Les 14
    // événements étaient ÉMIS et personne ne les lisait — cette lecture Plausible
    // ferme le tableau de bord manquant. Sans TypeORM : aucune table interne,
    // uniquement la Stats API de Plausible (déjà destinataire des événements).
    PlausibleChatbotClient,
    ChatbotFunnelService,
    // #1658.1 — la rétention par cohorte mensuelle d'ESPACES. Deux requêtes en
    // lecture, aucun service d'un autre module : la composition qui coûterait à
    // GA-07 n'a pas lieu d'être ici.
    RetentionCohortsService,
    // #1686 — l'entonnoir d'onboarding par cohorte mensuelle d'ESPACES. Trois
    // requêtes en lecture (`workspaces`, `product_events` en direct, et via
    // `workspace_members` pour les deux étapes qui ne portent que `userId`) ;
    // même famille que `RetentionCohortsService` juste au-dessus, aucun
    // service d'un autre module importé.
    OnboardingFunnelService,
    // #1683/#1684/#1687/#1688 — LA LECTURE du flux comportemental, qui n'existait
    // pas : `ProductAnalyticsService` porte trois écritures et zéro lecture. Un
    // seul repository (`ProductEventEntity`, déjà déclaré ci-dessus, GA-20),
    // aucun service d'un autre module — la composition qui coûterait à GA-07 n'a
    // pas lieu d'être ici.
    ProductAnalyticsReadService,
    // #1685 — la lecture d'usage par fonction. Un seul repository consommé
    // (`WorkspaceEntity`, déjà déclaré ci-dessus) : tout le reste tourne en
    // SQL brut via `manager.query`, comme `TeamKpisService`.
    FeatureAdoptionUsageService,
    // #2385.2 (épopée #2877) — signal EXPRESS de learning, lecture seule sur
    // `outreach_transitions` (repository déclaré ci-dessus, GA-20).
    MessageLearningSignalsService,
    // #2442.13 (épopée #2879) — action validée/exécutée/premier succès PAR
    // ESPACE, lecture seule sur `workflow_runs` (repository déclaré ci-dessus,
    // GA-20) et `approval_requests` (SQL brut).
    ActionOsAdoptionMetricsService,
    // #1685 — le SEUL endroit qui connaît encore `PlanCatalogService` par son
    // nom, et c'est un `.module.ts` : exclu de GA-07 par construction, parce
    // que le câblage appartient au module. `useFactory` typée par le port, et
    // pas `useExisting` — sinon une dérive de signature passerait.
    {
      provide: PLAN_CATALOG_PORT,
      useFactory: (catalog: PlanCatalogService): PlanCatalogPort => catalog,
      inject: [PlanCatalogService],
    },
  ],
  exports: [
    ProductAnalyticsService,
    ProviderCostService,
    ProviderCostRecorder,
    EnrichmentDurationService,
    ChatTurnCostEstimateService,
  ],
})
export class AnalyticsModule {}
