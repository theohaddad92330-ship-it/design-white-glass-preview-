import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ConsultantEntity } from '../../database/entities/consultant.entity'
import { ConsultantCvRewriteEntity } from '../../database/entities/consultant-cv-rewrite.entity'
import { CvVersionEntity } from '../../database/entities/cv-version.entity'
import { SkillAliasProposalEntity } from '../../database/entities/skill-alias-proposal.entity'
import { ConsultantPushFeedbackEntity } from '../../database/entities/consultant-push-feedback.entity'
import { ConsultantSkillEntity } from '../../database/entities/consultant-skill.entity'
import { ConsultantExperienceEntity } from '../../database/entities/consultant-experience.entity'
import { ConsultantDocumentEntity } from '../../database/entities/consultant-document.entity'
import { TalentPreparedMessageEntity } from '../../database/entities/talent-prepared-message.entity'
import { TalentIdentityDecisionEntity } from '../../database/entities/talent-identity-decision.entity'
import { SubmissionEntity } from '../../database/entities/submission.entity'
import { InterviewEntity } from '../../database/entities/interview.entity'
import { SubmissionFeedbackEntity } from '../../database/entities/submission-feedback.entity'
import { SubmissionConsultantFeedbackEntity } from '../../database/entities/submission-consultant-feedback.entity'
import { ProjectEntity } from '../../database/entities/project.entity'
import { ProjectNeedEntity } from '../../database/entities/project-need.entity'
import { MatchRunEntity, MatchRunEntryEntity, MatchWeightVersionEntity } from '../../database/entities/match-run.entity'
import { ShortlistEntity, ShortlistEntryEntity } from '../../database/entities/shortlist.entity'
import { TerritorySnapshotEntity } from '../../database/entities/territory-snapshot.entity'
import { EsnDirectoryEntity } from '../../database/entities/esn-directory.entity'
import { MarketVerificationReceiptEntity } from '../../database/entities/market-verification-receipt.entity'
import { ReverseMarketDismissalEntity } from '../../database/entities/reverse-market-dismissal.entity'
import { AccountEntity } from '../../database/entities/account.entity'
import { MissionEntity } from '../../database/entities/mission.entity'
import { MissionAssignmentEntity } from '../../database/entities/mission-assignment.entity'
import { CommercialTransitionEntity } from '../../database/entities/commercial-transition.entity'
import { RecordLinksController } from './record-links.controller'
import { RecordLinksService } from './record-links.service'
import { AccountFactsModule } from '../account-facts/account-facts.module'
import { ActivitiesModule } from '../activities/activities.module'
import { CrmCoreModule } from '../crm-core/crm-core.module'
import { IaModule } from '../ia/ia.module'
import { CreditsModule } from '../credits/credits.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { CommercialTransitionsModule } from '../commercial-transitions/commercial-transitions.module'
import { ConsultantsController } from './consultants.controller'
import { TalentController } from './talent.controller'
import { TalentFavoritesController } from './talent-favorites.controller'
import { SubmissionsController } from './submissions.controller'
import { SubmissionsService } from './submissions.service'
import { TalentMessageDraftService } from './talent-message-draft.service'
import { TalentService } from './talent.service'
import { ConsultantsService } from './consultants.service'
import { ConsultantErasureService } from './consultant-erasure.service'
import { CvBatchImportService } from './cv-batch-import.service'
import { CvBatchImportWorker } from './cv-batch-import.worker'
import { CV_BATCH_IMPORT_QUEUE } from './cv-batch-import.queue'
import { CvBatchImportJobEntity } from '../../database/entities/cv-batch-import-job.entity'
import { CV_ZIP_IMPORT_JOB_OPTIONS, CV_ZIP_IMPORT_QUEUE } from './cv-zip-import.queue'
import { CvZipImportWorker } from './cv-zip-import.worker'
import { CvZipLargeImportService } from './cv-zip-large-import.service'
import { CvIntakeService } from './cv-intake.service'
import { TalentIdentityService } from './talent-identity.service'
import { TalentRecruitmentController } from './talent-recruitment.controller'
import { TalentRecruitmentService } from './talent-recruitment.service'
import { TalentRecruitmentEventEntity } from '../../database/entities/talent-recruitment-event.entity'
import { CvParseService } from './cv-parse.service'
import { CV_AUTO_PARSE_JOB_OPTIONS, CV_AUTO_PARSE_QUEUE } from './cv-auto-parse.queue'
import { ConsultantEngagementService } from './consultant-engagement.service'
import {
  CONSULTANT_ENGAGEMENT_PROVENANCE_PORT,
  type ConsultantEngagementProvenancePort,
} from './consultant-engagement-provenance.port'
import { CV_AUTO_PARSE_PROVENANCE_PORT, type CvAutoParseProvenancePort } from './cv-auto-parse-provenance.port'
import { CvAutoParseService } from './cv-auto-parse.service'
import { CvAutoParseWorker } from './cv-auto-parse.worker'
import { CvAutoReadStatusService } from './cv-auto-read-status.service'
import { ProvenanceService } from '../crm-core/provenance.service'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { CvStudioService } from './cv-studio.service'
import { GeocodingService } from './geocoding.service'
import { SkillAliasService } from './skill-alias.service'
import { TalentPhotoService } from './talent-photo.service'
import { MissingExpertiseService } from './missing-expertise.service'
import { TalentPoolService } from './talent-pool.service'
import { AvailabilityImportService } from './availability-import.service'
import { AtsExportService } from './ats-export.service'
import { BulkExportController } from './bulk-export.controller'
import { BulkExportService } from './bulk-export.service'
import { BulkExportWorker } from './bulk-export.worker'
import { BulkExportGateway } from './bulk-export.gateway'
import { BULK_EXPORT_QUEUE } from './bulk-export.queue'
import { BulkExportJobEntity } from '../../database/entities/bulk-export-job.entity'
import { BulkCvRewriteService } from './bulk-cv-rewrite.service'
import { BulkCvRewriteWorker } from './bulk-cv-rewrite.worker'
import { BulkCvRewriteGateway } from './bulk-cv-rewrite.gateway'
import { BULK_CV_REWRITE_QUEUE } from './bulk-cv-rewrite.queue'
import { BulkCvRewriteJobEntity } from '../../database/entities/bulk-cv-rewrite-job.entity'
import { MatchingController } from './matching/matching.controller'
import { MatchingService } from './matching/matching.service'
import { BulkMatchingController } from './matching/bulk-matching.controller'
import { BulkMatchingService } from './matching/bulk-matching.service'
import { BulkMatchingWorker } from './matching/bulk-matching.worker'
import { AutoNeedMatchingService } from './matching/auto-need-matching.service'
import { NeedArrivalSubscriber } from './matching/need-arrival.subscriber'
import { NeedAutoMatchEntity } from '../../database/entities/need-auto-match.entity'
import { BulkMatchingGateway } from './matching/bulk-matching.gateway'
import { BULK_MATCHING_QUEUE } from './matching/bulk-matching.queue'
import { BulkMatchingJobEntity } from '../../database/entities/bulk-matching-job.entity'
import { InverseMatchingService } from './matching/inverse-matching.service'
import { ReverseMarketService } from './matching/reverse-market.service'
import { ReverseMarketDismissalService } from './matching/reverse-market-dismissal.service'
import { MarketVerificationController } from './verification/market-verification.controller'
import { MarketVerificationService } from './verification/market-verification.service'
import { ShortlistService } from './matching/shortlist.service'
// #2337 — le terrain de jeu multi-talents lit le périmètre de BU du demandeur.
import { BusinessUnitModule } from '../business-unit/business-unit.module'
import { TerritoryPlanFactsService } from './territory-plan/territory-plan-facts.service'
import { EsnProfileReaderModule } from '../esn-profile/esn-profile-reader.module'
import { PlanFeaturesModule } from '../plan-features/plan-features.module'
import { DecisionGatesModule } from '../decision-gates/decision-gates.module'
import { TasksModule } from '../tasks/tasks.module'
import { MailboxModule } from '../mailbox/mailbox.module'
import { StorageModule } from '../storage/storage.module'

/**
 * Vivier de consultants (annexe méthodo p22). Module autonome (règle #7) : le
 * retirer supprime le vivier + le matching sans casser le reste.
 *
 * `ProjectEntity` est importé en LECTURE seule (charger un besoin pour le
 * matcher). La dépendance est à sens unique — `ProjectsModule` n'importe
 * jamais celui-ci.
 */
@Module({
  imports: [
    AccountFactsModule,
    // LUD.4 — le domaine d'offre de l'espace (lecture seule, sans le graphe du module profil).
    EsnProfileReaderModule,
    // Gating par offre : le Vivier demande la feature `talent_pool`.
    PlanFeaturesModule,
    TypeOrmModule.forFeature([
      ConsultantEntity,
      // #2916 / #2399.2 (c93) — le sort du matching automatique d'un besoin entrant.
      NeedAutoMatchEntity,
      ConsultantPushFeedbackEntity,
      ConsultantCvRewriteEntity,
      CvVersionEntity,
      SkillAliasProposalEntity,
      ConsultantSkillEntity,
      ConsultantExperienceEntity,
      ConsultantDocumentEntity,
      // #2185.51 — les brouillons de message préparés depuis la fiche talent,
      // jamais envoyés, séparés du moteur outreach (contact_id NOT NULL).
      TalentPreparedMessageEntity,
      // #2327 — les décisions humaines sur une paire de fiches (propose, ne fusionne jamais).
      TalentIdentityDecisionEntity,
      // Théo C talents-recrutement — le journal des étapes de recrutement d'une personne.
      TalentRecruitmentEventEntity,
      SubmissionEntity,
      InterviewEntity,
      SubmissionFeedbackEntity,
      SubmissionConsultantFeedbackEntity,
      ProjectEntity,
      ProjectNeedEntity,
      MatchRunEntity,
      MatchRunEntryEntity,
      MatchWeightVersionEntity,
      ShortlistEntity,
      ShortlistEntryEntity,
      // La veille territoriale et le référentiel ESN, en LECTURE seule : la
      // prospection inversée lit le même relevé public que le territoire, vu
      // depuis un consultant. Les deux tables sont PARTAGÉES (sans
      // `workspace_id`), et ce module ne leur écrit rien.
      TerritorySnapshotEntity,
      EsnDirectoryEntity,
      // #2288.2 — les reçus de vérification à la demande : la CONSERVATION, ce
      // qui a déjà été vérifié et qu'on ne refacture pas. Scopée par espace.
      MarketVerificationReceiptEntity,
      // #2968 — « Masquer » un environnement du Reverse Market, par personne.
      ReverseMarketDismissalEntity,
      // #2288.4 (18/09, suite) — LECTURE SEULE : le SIREN déjà connu d'un
      // compte `completed` de cet espace, pour ancrer le lancement et le devis
      // sur la même entité. Aucune écriture depuis ce module (règle #7).
      AccountEntity,
      // #4194 — le panneau latéral unique lit ces trois tables, sans service tiers.
      MissionEntity,
      MissionAssignmentEntity,
      CommercialTransitionEntity,
      // #2326.12 (épopée #2794) — l'orchestrateur async d'import de CV.
      CvBatchImportJobEntity,
      // #1952.3 (épopée #2844, lot SRC5 28/09 soir) — l'orchestrateur async du matching massif.
      BulkMatchingJobEntity,
      // #1952.6 (épopée #2844, lot SRC5 28/09 soir) — l'orchestrateur async de l'export en lot.
      BulkExportJobEntity,
      // #1952.5 (épopée #2844, lot SRC5 28/09 soir) — l'orchestrateur async de la réécriture de CV en lot.
      BulkCvRewriteJobEntity,
      // c88 (04/10/2026) — LECTURE SEULE de `is_demo` : la lecture automatique
      // des CV part en mode scripté dans la salle de démonstration.
      WorkspaceEntity,
    ]),
    // #2326.12 — la queue réutilise le module BullMQ déjà branché (redis-connection.ts),
    // jamais une seconde connexion.
    BullModule.registerQueue({ name: CV_BATCH_IMPORT_QUEUE }),
    WorkspaceModule,
    // #2337 — `TerritoryPlanFactsService` borne les besoins au périmètre de BU
    // (`scopeFor`), même clause que `/accounts`. Sens unique : BusinessUnitModule
    // n'importe que WorkspaceModule.
    BusinessUnitModule,
    // Les activités : chaque étape d'un positionnement laisse une trace dans
    // l'historique du compte. Dépendance à sens unique.
    ActivitiesModule,
    // Le journal d'écriture (provenance + audit par champ). Éditer une fiche
    // talent ne laissait aucune trace, alors que comptes et contacts en
    // laissent depuis T0. Le commit est fait par le CONTRÔLEUR — GA-07 fige
    // les imports service → service.
    CrmCoreModule,
    // La réécriture de CV débite 1 crédit (monnaie unique) — même service que
    // l'analyse et l'enrichissement, pas un second compteur.
    CreditsModule,
    // Réécriture du CV selon la mission (p22) — le seul endroit du vivier qui
    // appelle un modèle. Tout le reste (matching, brief) est déterministe.
    IaModule,
    // La porte G4 : positionner un profil chez un client se journalise. Elle
    // était déclarée au catalogue depuis le socle et n'avait aucun appelant.
    DecisionGatesModule,
    // #2320.1 (LOT r3) — `ShortlistService.create()` écrit désormais dans le
    // journal besoin→shortlist→positionnement→mission (#2320.23) : la
    // shortlist était le SEUL des quatre sujets déclarés par ce chantier à
    // n'avoir aucun appelant.
    CommercialTransitionsModule,
    // Les relances J+3 et J+7 après un envoi sont des TÂCHES, pas des envois
    // automatiques — même file que le reste du CRM, pas un second rappel.
    TasksModule,
    // #2568.1 — le lot N lit une pièce jointe via LE connecteur existant,
    // jamais un second chemin de messagerie.
    MailboxModule,
    // #3065 (lot 2b) — l'archive ZIP volumineuse est déposée directement dans
    // le stockage (URL signée d'upload), jamais dans un corps de requête.
    StorageModule,
    // Un job par archive déposée : le clic « confirmer » rend la main, le
    // traitement (streaming, plusieurs minutes pour un lot de centaines de
    // fichiers) tourne dans le worker.
    BullModule.registerQueue({
      name: CV_ZIP_IMPORT_QUEUE,
      defaultJobOptions: CV_ZIP_IMPORT_JOB_OPTIONS,
    }),
    // #1952.3 (épopée #2844, lot SRC5 28/09 soir) — un job par lot de matching massif.
    BullModule.registerQueue({ name: BULK_MATCHING_QUEUE }),
    // #1952.6 (épopée #2844, lot SRC5 28/09 soir) — un job par lot d'export du vivier.
    BullModule.registerQueue({ name: BULK_EXPORT_QUEUE }),
    // #1952.5 (épopée #2844, lot SRC5 28/09 soir) — un job par lot de réécriture de CV.
    BullModule.registerQueue({ name: BULK_CV_REWRITE_QUEUE }),
    // c88 (04/10/2026, import ZIP de 688 CV) — un job par fiche créée à
    // l'import : la lecture automatique du CV par le modèle.
    BullModule.registerQueue({ name: CV_AUTO_PARSE_QUEUE, defaultJobOptions: CV_AUTO_PARSE_JOB_OPTIONS }),
  ],
  controllers: [
    ConsultantsController,
    TalentController,
    TalentRecruitmentController,
    TalentFavoritesController,
    SubmissionsController,
    MatchingController,
    BulkMatchingController,
    BulkExportController,
    RecordLinksController,
    // #2288.4 — le plan annoncé AVANT le geste payant, et le reçu gardé après.
    MarketVerificationController,
  ],
  providers: [
    ConsultantsService,
    RecordLinksService,
    // #3781 — l'effacement RGPD des personnes du vivier.
    ConsultantErasureService,
    TalentService,
    TalentMessageDraftService,
    SubmissionsService,
    CvIntakeService,
    // #2568.1 / #2569.1 — le lot N : messagerie et archive ZIP.
    CvBatchImportService,
    // #2326.12 (épopée #2794) — consomme la file `cv-batch-import`.
    CvBatchImportWorker,
    // #3065 (lot 2b) — l'import ZIP volumineux : le ticket d'upload, la mise
    // en file, et le worker qui lit l'archive en streaming depuis le stockage.
    CvZipLargeImportService,
    CvZipImportWorker,
    // #2327 — la résolution d'identité : lue par `GET /talents/:id/identity`
    // et par le dépôt de CV.
    TalentIdentityService,
    TalentRecruitmentService,
    CvParseService,
    // c88 (04/10/2026) — la lecture automatique des CV à l'import : la file,
    // son worker, et le port de provenance (câblé ICI, dans un `.module.ts`,
    // pour ne pas ajouter d'import service → service — GA-07).
    CvAutoParseService,
    CvAutoParseWorker,
    CvAutoReadStatusService,
    {
      provide: CV_AUTO_PARSE_PROVENANCE_PORT,
      useFactory: (provenance: ProvenanceService): CvAutoParseProvenancePort => provenance,
      inject: [ProvenanceService],
    },
    // #4196 — le consultant SUIT sa mission (en mission / disponible), via
    // `applyFieldUpdates`. Appelé par les CONTRÔLEURS de `delivery` (GA-07).
    ConsultantEngagementService,
    {
      provide: CONSULTANT_ENGAGEMENT_PROVENANCE_PORT,
      useFactory: (provenance: ProvenanceService): ConsultantEngagementProvenancePort => provenance,
      inject: [ProvenanceService],
    },
    CvStudioService,
    GeocodingService,
    SkillAliasService,
    TalentPhotoService,
    // Le détecteur d'expertise manquante (PDF 4 §8.4). Lu par
    // `GET /talents/missing-expertise` — un détecteur sans appelant est le
    // défaut n°1 de ce dépôt.
    MissingExpertiseService,
    TalentPoolService,
    MatchingService,
    // #1952.3 (épopée #2844, lot SRC5 28/09 soir) — le lot de matching massif : service, worker, passerelle.
    BulkMatchingService,
    BulkMatchingWorker,
    BulkMatchingGateway,
    // #2916 / #2399.2 (`c93_matching_auto_besoin_entrant`) — le matching
    // AUTOMATIQUE d'un besoin entrant : l'abonné ORM voit chaque insertion de
    // `project_needs` (toutes portes), le service décide et met en file sur
    // `bulk-matching` (job `auto-need-match`, routé par `BulkMatchingWorker`).
    AutoNeedMatchingService,
    NeedArrivalSubscriber,
    // #1952.6 (épopée #2844, lot SRC5 28/09 soir) — le lot d'export : service, worker, passerelle.
    BulkExportService,
    BulkExportWorker,
    BulkExportGateway,
    // #1952.5 (épopée #2844, lot SRC5 28/09 soir) — le lot de réécriture de CV : service, worker, passerelle.
    BulkCvRewriteService,
    BulkCvRewriteWorker,
    BulkCvRewriteGateway,
    InverseMatchingService,
    ReverseMarketService,
    ReverseMarketDismissalService,
    MarketVerificationService,
    ShortlistService,
    TerritoryPlanFactsService,
    // #2326.7/.9 (épopée #2794) — tableau de disponibilités CSV/XLSX, met à
    // jour, ne crée jamais.
    AvailabilityImportService,
    // #2326.8 (épopée #2794) — export ATS du vivier entier.
    AtsExportService,
  ],
  // #2327.26 — exportée pour que le pont Laura (`copilot-bridge`) rende la
  // MÊME explication que l'écran, sans refaire `findTalentDuplicates`.
  exports: [
    ConsultantsService,
    TalentService,
    SubmissionsService,
    MatchingService,
    TalentPoolService,
    TalentIdentityService,
    // #2337 — lu par le pont Laura (`POST /internal/copilot/talents/territory-plan`).
    TerritoryPlanFactsService,
    // #3816.1 — lu par le pont Laura (`POST /internal/copilot/talents/reverse-market`).
    ReverseMarketService,
    // #3865.2 (lot X05, 08/10) — lu par le pont Laura (`POST /internal/copilot/talents/needs-match`) :
    // le matching INVERSE (« à quels besoins ce profil répond-il ? ») existait déjà pour l'écran
    // consultant (`POST /consultants/:id/match-inverse`), sans appelant côté conversation.
    InverseMatchingService,
    // #1952.4 (épopée #2844) — lu par `laura/import-overview` pour l'état des
    // imports de CV en lot déjà lancés depuis l'écran.
    CvBatchImportService,
    // #4196 — `MissionStatusController` / `MissionLifecycleController` (delivery) l'appellent :
    // un service injecté sans être exporté ne se voit qu'au boot (GA-42).
    ConsultantEngagementService,
  ],
})
export class ConsultantsModule {}
