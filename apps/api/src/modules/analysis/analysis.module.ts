import { forwardRef, Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { AccountVocabularyEntity } from '../../database/entities/account-vocabulary.entity'
import { AnalysisRunEntity } from '../../database/entities/analysis-run.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { RagDocumentEntity } from '../../database/entities/rag-document.entity'
// Axe RELATION (#2298.4, lot 19/09) — `RelationAxisReaderService` n'importe
// AUCUN service voisin, seulement ces deux entités (schéma partagé, hors
// périmètre GA-07). Voir son docstring.
import { MissionEntity } from '../../database/entities/mission.entity'
import { ActivityEntity } from '../../database/entities/activity.entity'
import { AccountPartnerEntity } from '../../database/entities/account-partner.entity'
import { PartnerRelationEntity } from '../../database/entities/partner-relation.entity'
import { ActionPlanEntity } from '../../database/entities/action-plan.entity'
import { AttackAngleEntity } from '../../database/entities/attack-angle.entity'
import { OutboxEntity } from '../../database/entities/outbox.entity'
import { AccountFeedbackModule } from '../account-feedback/account-feedback.module'
import { AccountsModule } from '../accounts/accounts.module'
import { ContactsModule } from '../contacts/contacts.module'
import { CreditsModule } from '../credits/credits.module'
import { CrmModule } from '../crm/crm.module'
import { CrmCoreModule } from '../crm-core/crm-core.module'
import { MarketMemoryModule } from '../market-memory/market-memory.module'
import { MarketMemoryService } from '../market-memory/market-memory.service'
import { ZeroLayerModule } from '../zero-layer/zero-layer.module'
import { ZeroLayerService } from '../zero-layer/zero-layer.service'
import { EsnProfileReaderModule } from '../esn-profile/esn-profile-reader.module'
import { NotificationsCoreModule } from '../notifications/notifications-core.module'
import { IntegrationsModule } from '../integrations/integrations.module'
import { ProjectsModule } from '../projects/projects.module'
import { OrgGraphModule } from '../org-graph/org-graph.module'
// Zones blanches (Drive backlog #5) — réutilisées par le planificateur
// d'enrichissement pour le mode « Rôles manquants », sans recalculer la
// couverture une seconde fois. CoverageModule n'importe pas AnalysisModule
// DIRECTEMENT, mais importe AccountsModule, qui importe déjà AnalysisModule
// (en forwardRef, plus bas) : le cycle est donc AccountsModule ->
// AnalysisModule -> CoverageModule -> AccountsModule, sur TROIS modules —
// raté à la première lecture (« ne pas importer AnalysisModule » n'est pas
// « ne participer à aucun cycle »). Mesuré : `ReferenceError: Cannot access
// 'AccountsModule' before initialization` sur toute la suite Jest qui touche
// AccountsModule. forwardRef() ci-dessous, comme AccountsModule le fait déjà
// pour ce même import.
import { CoverageModule } from '../coverage-gaps/coverage.module'
import { SignalHistoryModule } from '../signal-history/signal-history.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { AccountVocabularyService } from './account-vocabulary.service'
import { ActionPlansService } from './action-plans.service'
import { AttackAnglesService } from './attack-angles.service'
import { AnalysisAuditConsumer } from './analysis-audit.consumer'
import { AnalysisCancellationService } from './analysis-cancellation.service'
import { AnalysisCheckpointReader } from './analysis-checkpoint.reader'
import { AnalysisEventEmitter } from './analysis-event-emitter.service'
import { AnalysisOnDemandService } from './analysis-ondemand.service'
import { SegmentCatchupService } from './segment-catchup.service'
// #2637.1 — le rattrapage AUTOMATIQUE des rôles manquants. Voisin de
// `SegmentCatchupService` mais PAYANT (voir son docblock) : réutilise
// `OrgEnrichmentJobService.advance`, jamais `AnalysisOnDemandService`.
import { MissingRolesCatchupService } from './missing-roles-catchup.service'
import { AnalysisRefreshService } from './analysis-refresh.service'
import { AnalysisDeepenService } from './analysis-deepen.service'
import { CreditLedgerEntity } from '../../database/entities/credit-ledger.entity'
import { OrgEnrichmentPlannerService } from './org-enrichment-planner.service'
import { OrgEnrichmentJobService } from './org-enrichment-job.service'
import { OrgFreshnessService } from './org-freshness.service'
import { OrgEnrichmentJobEntity } from '../../database/entities/org-enrichment-job.entity'
import { OrgFocusWeightsService } from './org-focus-weights.service'
import { OrgFocusWeightsEntity } from '../../database/entities/org-focus-weights.entity'
import { OutboxModule } from '../outbox/outbox.module'
import { AnalysisController } from './analysis.controller'
import { AnalysisService } from './analysis.service'
import { REPLAN_JOB_OPTIONS, REPLAN_QUEUE } from './replan.queue'
import { ReplanService } from './replan.service'
import { ReplanWorker } from './replan.worker'
import { AnalysisWorker } from './analysis.worker'
import { AnalysisGateway } from './analysis.gateway'
import { AnalysisPersistenceService } from './analysis.persistence'
import { AnalysisRunsService } from './analysis-runs.service'
import { INTERNAL_HISTORY_SOURCE, type InternalHistorySource } from './internal-history-source'
import { MARKET_PATH_AXIS_SOURCE, type MarketPathAxisSource } from './market-path-axis-source'
import { CRM_DEAL_LINK_PORT, type CrmDealLinkPort } from './crm-deal-link-port'
import { CrmReadService } from '../crm/crm-read.service'
import { AnalysisAttachmentBinderService } from './analysis-attachment-binder.service'
import { RelationAxisReaderService } from './relation-axis-reader.service'
import { TargetListItemEntity } from '../../database/entities/target-list-item.entity'
import { SellerHypothesesReader } from './seller-hypotheses.reader'
import { ChannelPerformanceReaderService } from './channel-performance-reader.service'
import { MARKET_MEMORY_TELEMETRY } from '@bellum/contracts'
import { ProductAnalyticsService } from '../analytics/product-analytics.service'
import { PAID_VERIFICATION_TELEMETRY, type PaidVerificationTelemetry } from './paid-verification-telemetry.port'
import { StuckAnalysisReaper } from './stuck-analysis.reaper'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { InternalAnalyzeController } from './internal-analyze.controller'
import { InternalProgressController } from './internal-progress.controller'
import { InternalTelemetryController } from './internal-telemetry.controller'
import { AnalysisTelemetryService } from './analysis-telemetry.service'
import { ORG_REBUILD_JOB_OPTIONS, ORG_REBUILD_QUEUE } from './org-rebuild.queue'
import { OrgRebuildWorker } from './org-rebuild.worker'
import { NeedProposalEntity } from '../../database/entities/need-proposal.entity'
import { NeedProposalsService } from './need-proposals.service'
import { BusinessUnitModule } from '../business-unit/business-unit.module'
import { AccountIntelligenceModule } from '../account-intelligence/account-intelligence.module'
import { AccountIntelligenceContextService } from '../account-intelligence/account-intelligence-context.service'
import { CommercialBriefStep } from './commercial-brief.step'
import { DossierBlocksStep } from './dossier-blocks.step'
import { CommercialBriefBackfillService } from './commercial-brief-backfill.service'
import {
  COMMERCIAL_BRIEF_CONTEXT_SOURCE,
  toCommercialBriefContext,
  type CommercialBriefContextSource,
} from './commercial-brief-context-source'
import { QualificationGridModule } from '../qualification-grid/qualification-grid.module'
import { QualificationGridService } from '../qualification-grid/qualification-grid.service'
import { ANALYSIS_QUALIFICATION_STEP } from './qualification-step-port'
// #4070 — les faits du compte (socle #4069) comme intrant du run. Le lecteur est UNIQUE
// (`AccountFactsService`) ; le service du module ne le connaît que par le jeton (GA-07).
import { AccountFactsModule } from '../account-facts/account-facts.module'
import { AccountFactsService } from '../account-facts/account-facts.service'
import { CapitalisationModule } from '../capitalisation/capitalisation.module'
import { CapitalisationService } from '../capitalisation/capitalisation.service'
import { lostDealRexContextFor } from '../ia-proxy/lost-deal-rex-context'
import { FieldProvenanceEntity } from '../../database/entities/field-provenance.entity'
import { AnalysisFactsInputsService } from './analysis-facts-inputs.service'
import { LauraBatchFollowService } from './laura-batch-follow.service'
import { ANALYSIS_ACCOUNT_FACTS_SOURCE, type AnalysisAccountFactsSource } from './analysis-facts-inputs'

@Module({
  imports: [
    // #4070 — le lecteur unique des faits du compte. Module AUTONOME (TypeORM + mémoire marché
    // par jeton), sans retour vers AnalysisModule : aucun cycle.
    AccountFactsModule,
    // #4070.2 — les motifs de perte déclarés (REX de perte). N'importe que Workspace et
    // MarketMemory : aucun cycle (même constat que `ia-proxy.module.ts`).
    CapitalisationModule,
    // #3755 — la grille de qualification de l'espace, évaluée en fin d'analyse.
    // Module autonome (il n'importe que WorkspaceModule) : aucun cycle.
    QualificationGridModule,
    // Le cloisonnement de périmètre (BU) — le contrôleur le résout au bord.
    // Module autonome (il n'importe que WorkspaceModule) : aucun cycle.
    BusinessUnitModule,
    forwardRef(() => AccountsModule),
    // Mémoire de corrections (feedback loop A2) — module autonome sans dépendance
    // à AccountsModule, donc importable ici sans cycle.
    AccountFeedbackModule,
    ContactsModule,
    CreditsModule,
    // Couche zéro de la méthodologie de vente (annexe p8) : le run interroge le
    // CRM connecté de l'ESN avant de proposer une approche froide. Module
    // autonome (CrmModule n'importe pas AnalysisModule) → aucun cycle ; sans CRM
    // configuré il ne fait rien et ne coûte aucun appel réseau.
    CrmModule,
    // #3219 (#190.2, lot P02 07/10) — `AnalysisPersistenceService` journalise
    // la PORTÉE déclarée d'un effectif via `ProvenanceService.commit` (GA-07 :
    // `crm-core` n'importe pas `AnalysisModule` → aucun cycle, même capacité
    // déjà importée par `CrmModule`/`DeliveryModule` pour une raison voisine).
    CrmCoreModule,
    // Couche zéro, suite (p8) : les AUTRES outils internes de l'ESN — Drive,
    // notes, e-mails, ATS. Même propriété que CrmModule : autonome, et sans
    // aucune intégration connectée il ne fait rien et n'ouvre aucune socket.
    ZeroLayerModule,
    // Axe CHEMIN de l'adressabilité (#1631.3/.4, lot 14) : `AnalysisService` et
    // `AnalysisOnDemandService` résolvent le compte de parcours + l'ESN dominante
    // via `MarketMemoryService.pathAxisFor` avant chaque run. Module autonome
    // (aucune dépendance à AnalysisModule) → aucun cycle ; sans couverture, il ne
    // fait qu'une lecture en base, jamais d'appel réseau.
    MarketMemoryModule,
    // Brief commercial (chantier « briefs comptes », 01/10/2026) : les faits
    // internes du compte (mémoire marché + référentiel + siège résolu) via la
    // façade #1618. Module autonome (TypeORM + DataforgeModule +
    // MarketMemoryModule, aucun n'importe AnalysisModule) → aucun cycle.
    AccountIntelligenceModule,
    EsnProfileReaderModule,
    NotificationsCoreModule,
    IntegrationsModule,
    WorkspaceModule,
    // Opportunity Graph — the persistence step materializes opportunities on
    // completion. Autonomous module, no back-dependency on AnalysisModule → no cycle.
    forwardRef(() => ProjectsModule),
    // Versionnement du graphe d'organigramme (Annexe Organigramme §5) : le
    // lancement relit la mémoire des rejets. Module autonome — aucun cycle.
    OrgGraphModule,
    // Historique de signal (V2 §11) : la persistance de la recherche historise
    // les signaux fraîchement écrits. Module autonome — aucun cycle.
    SignalHistoryModule,
    forwardRef(() => CoverageModule),
    OutboxModule,
    // ``OutboxEntity`` is registered here (not just by the outbox module's
    // drainer) so ``AnalysisCheckpointReader`` can inject a repo and run
    // its checkpoint lookup query directly.
    TypeOrmModule.forFeature([
      ActionPlanEntity,
      AttackAngleEntity,
      AccountVocabularyEntity,
      AnalysisRunEntity,
      OutboxEntity,
      AccountEntity,
      ContactEntity,
      // #4070.4 — `AnalysisFactsInputsService` nomme les champs de fiche corrigés par un humain.
      FieldProvenanceEntity,
      // #2452 — le devis d'approfondissement lit ce que chaque compte a déjà coûté.
      CreditLedgerEntity,
      // Axe RELATION (#2298.4) : `RelationAxisReaderService` injecte ces deux
      // repositories directement (schéma partagé, hors GA-07) — un repo
      // injecté sans être déclaré ne planterait qu'au BOOT (GA-20).
      MissionEntity,
      ActivityEntity,
      AccountPartnerEntity,
      // #2371.4 — le 10e stade « partenaire actif » (placements en cours, même SIREN).
      PartnerRelationEntity,
      // #3753.3 — `SellerHypothesesReader` lit le ciblage de l'ESN (lecture seule).
      TargetListItemEntity,
      // Les besoins PROPOSÉS par un run (PDF 4, PE5). La table appartient au
      // producteur : `project_needs` reste chez `projects`, qui décide.
      NeedProposalEntity,
      // #3623 — `AnalysisAttachmentBinderService` range les pièces jointes au compte au lancement.
      RagDocumentEntity,
      // Le plan d'enrichissement PERSISTÉ (§11 FINAL). Déclarée ici parce que
      // `OrgEnrichmentJobService` injecte son repository (GA-20) : un repo
      // injecté sans être déclaré ne planterait qu'au BOOT, en production.
      OrgEnrichmentJobEntity,
      // Le focus du plan, regle par espace — l'ecart au defaut. Declaree ici
      // parce que `OrgFocusWeightsService` injecte son repository (GA-20).
      OrgFocusWeightsEntity,
    ]),
    BullModule.registerQueue(
      // #1092 : la re-planification rend la main tout de suite et calcule en
      // fond — la passerelle qui sert l'application coupe à 120 s, le calcul
      // dure une à deux minutes.
      { name: REPLAN_QUEUE, defaultJobOptions: REPLAN_JOB_OPTIONS },
      {
        name: 'analysis',
        defaultJobOptions: {
          removeOnComplete: { age: 86_400, count: 1000 },
          removeOnFail: { age: 604_800 },
        },
      },
      {
        name: 'analysis-dlq',
        defaultJobOptions: {
          removeOnComplete: { age: 2_592_000 },
          removeOnFail: false,
        },
      },
      // Reconstruction du graphe d'organigramme derrière une recherche ciblée :
      // hors de la requête du bouton, qui additionnerait sinon deux budgets de
      // phase sur un clic (voir `org-rebuild.queue.ts`).
      {
        name: ORG_REBUILD_QUEUE,
        defaultJobOptions: ORG_REBUILD_JOB_OPTIONS,
      },
    ),
  ],
  controllers: [AnalysisController, InternalAnalyzeController, InternalProgressController, InternalTelemetryController],
  providers: [
    // #4462.9 — le classement « par où commencer » à la fin d'un lot d'analyses lancé par Laura.
    LauraBatchFollowService,
    ReplanService,
    ReplanWorker,
    NeedProposalsService,
    // Étape 5 du pipeline (`agent_docs/pipeline.md`) — appelée par le worker.
    CommercialBriefStep,
    DossierBlocksStep,
    // #3755 — le port d'évaluation de la grille, branché sur le service du module
    // `qualification-grid` (le worker ne connaît que le port, GA-07).
    { provide: ANALYSIS_QUALIFICATION_STEP, useExisting: QualificationGridService },
    /**
     * Le PORT des faits internes du brief (GA-07) — même idiome que l'axe
     * CHEMIN plus bas : `useFactory` avec le port en TYPE DE RETOUR. La
     * projection (`toCommercialBriefContext`) retire ce qui décrit notre
     * propre prospection ; elle vit à côté du port, testable seule.
     */
    {
      provide: COMMERCIAL_BRIEF_CONTEXT_SOURCE,
      inject: [AccountIntelligenceContextService],
      useFactory: (facade: AccountIntelligenceContextService): CommercialBriefContextSource => ({
        contextFor: async (accountId, workspaceId) => {
          const view = await facade.contextFor(accountId, workspaceId)
          return view ? toCommercialBriefContext(view) : null
        },
      }),
    },
    SellerHypothesesReader,
    AnalysisService,
    AnalysisWorker,
    AnalysisGateway,
    AnalysisTelemetryService,
    AnalysisPersistenceService,
    AnalysisRunsService,
    OrgRebuildWorker,
    // Durable safety net: flips accounts stuck in `analyzing` (worker died mid-run,
    // no live job, past the job ceiling) to `error` so the "analyse en cours" ghost
    // can't live forever. Discovered by the scheduler via OutboxModule's forRoot().
    StuckAnalysisReaper,
    ActionPlansService,
    AttackAnglesService,
    AccountVocabularyService,
    InternalSecretGuard,
    AnalysisCancellationService,
    AnalysisCheckpointReader,
    AnalysisOnDemandService,
    AnalysisRefreshService,
    AnalysisDeepenService,
    // #AF (18/09/2026) — le rattrapage ciblé par segment (#2543). Réutilise
    // `AnalysisOnDemandService` tel quel, n'ajoute que le ciblage.
    SegmentCatchupService,
    // Point 45 (briefs comptes) — rattrapage ciblé du brief ; porte : admin.
    CommercialBriefBackfillService,
    AnalysisEventEmitter,
    AnalysisAuditConsumer,
    OrgEnrichmentPlannerService,
    OrgEnrichmentJobService,
    // #2637.1 (21/09/2026) — réutilise `OrgEnrichmentJobService` tel quel,
    // n'ajoute que le ciblage par date et les deux bornes anti-boucle.
    MissingRolesCatchupService,
    OrgFreshnessService,
    OrgFocusWeightsService,
    // Axe RELATION (#2298.4) — voir `relation-axis-reader.service.ts`. Service
    // concret, jamais un port : il n'importe aucun service voisin (seulement
    // deux entités), donc aucune indirection GA-07 n'est nécessaire ici.
    RelationAxisReaderService,
    AnalysisAttachmentBinderService,
    // #3278.3 — même idiome : injecte `ActivityEntity` (déjà déclarée), aucun service voisin.
    ChannelPerformanceReaderService,
    // #4070 — les lectures du lancement (faits, interlocuteurs de missions, analyse précédente).
    AnalysisFactsInputsService,
    /**
     * #4070 — le PORT des faits du compte : `useFactory` avec le port en TYPE DE RETOUR (la
     * compilation tombe si `AccountFactsService` change de forme), jamais `useExisting`.
     * Les deux services sont `optional` : sans eux le run part sans faits, byte-identique.
     */
    {
      provide: ANALYSIS_ACCOUNT_FACTS_SOURCE,
      inject: [
        { token: AccountFactsService, optional: true },
        { token: CapitalisationService, optional: true },
      ],
      useFactory: (
        facts?: AccountFactsService,
        capitalisation?: CapitalisationService,
      ): AnalysisAccountFactsSource => ({
        facts: async args => (await facts?.forAccount(args))?.facts ?? null,
        lostDealRex: async ({ workspaceId, accountId }) =>
          capitalisation
            ? lostDealRexContextFor(await capitalisation.lostDealRexForAccount(workspaceId, accountId))
            : null,
      }),
    },
    /**
     * Le PORT de l'axe CHEMIN (lot 14, GA-07) — voir `market-path-axis-source.ts`.
     *
     * ⚠️ `useFactory` avec le port en TYPE DE RETOUR, et non `useExisting`. C'est
     * la seule des deux formes qui prouve quelque chose : un jeton est un
     * symbole, TypeScript ne le relie à aucune forme, et un `useExisting` aurait
     * accepté n'importe quel fournisseur. Ici, le jour où `MarketMemoryService`
     * change de signature, la COMPILATION tombe — pas la production, sur un axe
     * silencieusement redevenu non mesuré.
     */
    // #4687 — le PORT de l'historique interne (couche zéro) pour le rejeu ciblé de la recherche, même idiome.
    {
      provide: INTERNAL_HISTORY_SOURCE,
      inject: [ZeroLayerService],
      useFactory: (service: ZeroLayerService): InternalHistorySource => service,
    },
    {
      // Lot 762 P5 — le rattachement des deals CRM (GA-07 : un port, pas un import de service).
      provide: CRM_DEAL_LINK_PORT,
      inject: [CrmReadService],
      useFactory: (service: CrmReadService): CrmDealLinkPort => service,
    },
    {
      provide: MARKET_PATH_AXIS_SOURCE,
      inject: [MarketMemoryService],
      useFactory: (service: MarketMemoryService): MarketPathAxisSource => service,
    },
    /**
     * #1639 — le PORT du compteur « vérifier aujourd'hui » (GA-07), même idiome
     * que l'axe CHEMIN juste au-dessus : `useFactory` avec le port en TYPE DE
     * RETOUR, jamais `useExisting`.
     *
     * L'adaptateur est écrit ICI, dans le `.module.ts`, et pas dans le service :
     * c'est ce qui permet à `analysis-refresh.service.ts` de ne jamais nommer
     * `ProductAnalyticsService`. `AnalyticsModule` est `@Global()`, donc le
     * service est injectable sans l'importer.
     *
     * Le nom de l'événement vient du contrat partagé (`MARKET_MEMORY_TELEMETRY`)
     * — le même que lit l'émetteur du préfiltre côté `accounts.controller.ts`.
     * Deux chaînes recopiées auraient divergé, et une divergence de nom
     * d'événement ne se voit qu'à la lecture du journal, des semaines plus tard.
     */
    {
      provide: PAID_VERIFICATION_TELEMETRY,
      // ⚠️ `optional: true`. `AnalyticsModule` est `@Global()`, donc le service
      // est TOUJOURS là en production — mais une poignée de specs compilent
      // `AnalysisModule` seul, hors du graphe global, et un `inject` strict y
      // faisait tomber la compilation du module entier pour une ligne de
      // journal. Un compteur ne doit jamais pouvoir empêcher un module de
      // démarrer : absent, l'adaptateur devient un no-op STRICT — aucune
      // écriture, aucun appel, jamais une mesure inventée.
      inject: [{ token: ProductAnalyticsService, optional: true }],
      useFactory: (analytics?: ProductAnalyticsService): PaidVerificationTelemetry => ({
        paidVerificationTriggered: ({ userId, accountId, gesture, creditsDebited }) => {
          void analytics?.track(MARKET_MEMORY_TELEMETRY.paidVerificationEvent, {
            userId,
            properties: { account_id: accountId, gesture, credits_debited: creditsDebited },
          })
        },
      }),
    },
  ],
  exports: [
    LauraBatchFollowService,
    NeedProposalsService,
    AnalysisService,
    AnalysisCancellationService,
    ActionPlansService,
    AnalysisRunsService,
    // Un-billed single-phase re-runs — consumed by the watchlist refresh cron
    // (system signal refresh, no enrichment-credit debit).
    AnalysisOnDemandService,
    // #AF — consommé par AdminSegmentCatchupController (admin.module.ts).
    SegmentCatchupService,
    // Point 45 (briefs comptes) — consommé par AdminCommercialBriefBackfillController.
    CommercialBriefBackfillService,
    // #2637.1 — consommé par AdminMissingRolesCatchupController (admin.module.ts).
    MissingRolesCatchupService,
  ],
})
export class AnalysisModule {}
