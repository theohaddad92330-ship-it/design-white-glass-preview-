import { forwardRef, Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { LossReasonEntity } from '../../database/entities/loss-reason.entity'
import { NeedUnstaffableReasonEntity } from '../../database/entities/need-unstaffable-reason.entity'
import { NeedDocumentEntity } from '../../database/entities/need-document.entity'
import { NeedStepEntity } from '../../database/entities/need-step.entity'
import { ProjectDocumentEntity } from '../../database/entities/project-document.entity'
import { ProjectStepEntity } from '../../database/entities/project-step.entity'
import { PipelineStageLabelEntity } from '../../database/entities/pipeline-stage-label.entity'
import { ProjectContactEntity } from '../../database/entities/project-contact.entity'
import { ProjectNeedEntity } from '../../database/entities/project-need.entity'
import { ProjectEntity } from '../../database/entities/project.entity'
import { ShortlistEntity } from '../../database/entities/shortlist.entity'
import { SubmissionEntity } from '../../database/entities/submission.entity'
import { MissionEntity } from '../../database/entities/mission.entity'
import { ActivitiesModule } from '../activities/activities.module'
import { CrmModule } from '../crm/crm.module'
import { AccountGateModule } from '../account-gate/account-gate.module'
import { DecisionGatesModule } from '../decision-gates/decision-gates.module'
import { DeliveryModule } from '../delivery/delivery.module'
import { IaModule } from '../ia/ia.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { StorageModule } from '../storage/storage.module'
import { CommercialTransitionsModule } from '../commercial-transitions/commercial-transitions.module'
import { NeedDocumentsService } from './need-documents.service'
import { NeedStepsService } from './need-steps.service'
import { ProjectDocumentsService } from './project-documents.service'
import { ProjectStepsService } from './project-steps.service'
import { ProjectSynthesisService } from './project-synthesis.service'
import { NeedVerdictService } from './need-verdict.service'
import { AccountsModule } from '../accounts/accounts.module'
import { NeedContradictionsService } from './need-contradictions.service'
import { NeedCompileTextService } from './need-compile-text.service'
import { NeedCommercialStateService } from './need-commercial-state.service'
import { OpenNeedsService } from './open-needs.service'
import { ProjectPipelineService } from './project-pipeline.service'
import { DealProbabilityService } from './deal-probability.service'
import { SharedBaseModule } from '../shared-base/shared-base.module'
import { ObjectPrivacyController } from './object-privacy.controller'
import { ObjectPrivacyService } from './object-privacy.service'
import { ProjectsController } from './projects.controller'
// #4288.4 — les affaires perdues lues par Laura, sur la même population que l'écran Projets.
import { CopilotLostProjectsController } from './copilot-lost-projects.controller'
import { ProjectsService } from './projects.service'
import { PlanFeaturesModule } from '../plan-features/plan-features.module'
import { AnalysisModule } from '../analysis/analysis.module'
import { TasksModule } from '../tasks/tasks.module'
// #4339.2 — le brouillon de la proposition « Préparer le mail de suite » (`MailboxService.createDraft`, jamais d'envoi).
import { MailboxModule } from '../mailbox/mailbox.module'
// #2339.7 — résoudre LE positionnement retenu d'un besoin au moment de
// `create_mission` (`SubmissionsService.acceptedForNeed`). Sens unique :
// `ConsultantsModule` (Vivier) ne nous importe jamais.
import { ConsultantsModule } from '../consultants/consultants.module'

/**
 * Le Projet — l'objet pivot du CRM/ATS. Module autonome (règle #7) : le retirer
 * supprime `/projects` et le crochet de matérialisation sans toucher au reste.
 *
 * `ProjectsService` est exporté pour que le pipeline d'analyse matérialise à la
 * fin d'un run. `CrmModule` est importé pour l'export projet → CRM
 * (`CrmTaskService`, provider-agnostique) — dans un seul sens : CrmModule ne
 * nous importe jamais.
 */
@Module({
  imports: [
    // Gating par offre : les Projets demandent la feature `needs`.
    PlanFeaturesModule,
    TypeOrmModule.forFeature([
      ProjectEntity,
      ProjectNeedEntity,
      ProjectContactEntity,
      PipelineStageLabelEntity,
      LossReasonEntity,
      NeedUnstaffableReasonEntity,
      NeedDocumentEntity,
      NeedStepEntity,
      ProjectStepEntity,
      ProjectDocumentEntity,
      // #2171.27 — la synthèse lit le compte (raw_analysis) et les contacts
      // liés ; en LECTURE seule (`ProjectSynthesisService`), aucune écriture
      // sur ces deux tables depuis ce module.
      AccountEntity,
      ContactEntity,
      // #2339.1/.2/.5/.6/.11/.13 (épopée #2795) — `NeedCommercialStateService`
      // lit les trois sujets qui n'appartiennent pas à ce module (shortlist,
      // positionnement, mission) pour les rejoindre au besoin. Registrer leur
      // dépôt ICI plutôt que d'aller le chercher chez `ConsultantsModule` /
      // `DeliveryModule` : les deux ne les EXPORTENT pas (leur périmètre est
      // l'écriture), et TypeORM autorise le même dépôt enregistré dans deux
      // modules sans conflit.
      ShortlistEntity,
      SubmissionEntity,
      MissionEntity,
    ]),
    WorkspaceModule,
    // #2171.27 — la synthèse d'opportunité appelle Claude via `IaClient`, même
    // geste que `NeedPlayService` (module Comptes).
    IaModule,
    // #2320.23 — le journal de transition de la chaîne commerciale.
    CommercialTransitionsModule,
    // Le stockage des pièces d'une affaire (31/08/2026). Importé pour le
    // CONTRÔLEUR — c'est lui qui dépose les octets puis écrit la ligne, parce
    // que c'est lui qui a tranché le droit. Sens unique : le stockage ne nous
    // importe pas, donc aucun cycle.
    StorageModule,
    CrmModule,
    // Le déplacement d'étape écrit une activité `stage_change` — le type était
    // déclaré et contraint en base sans qu'aucun code ne l'écrive. Sens unique :
    // ActivitiesModule ne nous importe pas, donc aucun cycle.
    ActivitiesModule,
    // Porte G8 : clore un projet est une décision journalisée.
    DecisionGatesModule,
    // Les deux actions que le panneau d'effets confie au serveur : créer la
    // mission d'un projet gagné, écarter le compte d'un projet perdu. Sens
    // unique dans les deux cas — ni Delivery ni la porte G1 ne nous importent,
    // donc aucun cycle.
    DeliveryModule,
    AccountGateModule,
    // Les besoins PROPOSÉS appartiennent au module qui les PRODUIT (l'analyse) ;
    // c'est ici qu'on les DÉCIDE. `forwardRef` parce que l'analyse nous importe
    // déjà pour créer un besoin accepté — deux domaines qui se répondent, pas
    // un couplage de services.
    forwardRef(() => AnalysisModule),
    // #2172.39 - la prochaine action d'une conversion est une tache sur le
    // projet. Sens unique : TasksModule ne nous importe pas, donc aucun cycle.
    TasksModule,
    // #2339.7 — résoudre LE positionnement retenu d'un besoin (Vivier) au
    // moment de `create_mission`, dans le CONTRÔLEUR (§3.2/GA-07, hors
    // périmètre de la garde service→service : les `*.controller.ts` en sont
    // exclus). Sens unique : ConsultantsModule ne nous importe jamais.
    ConsultantsModule,
    MailboxModule,
    // #3390.9 — `AccountStrategy5PService` (exporté) : les 5P du compte d'un besoin. `forwardRef` : Accounts → Analysis → Projects
    // boucle déjà sur ce fichier (même motif que `AnalysisModule` plus haut).
    forwardRef(() => AccountsModule),
    // #4016 L1 — la base anonyme commune calibre la probabilité d'une affaire
    // (a priori borné). Sens unique : SharedBaseModule n'importe aucun module.
    SharedBaseModule,
  ],
  controllers: [ProjectsController, ObjectPrivacyController, CopilotLostProjectsController],
  providers: [
    ObjectPrivacyService,
    ProjectsService,
    ProjectPipelineService,
    OpenNeedsService,
    NeedDocumentsService,
    NeedStepsService,
    ProjectStepsService,
    ProjectDocumentsService,
    ProjectSynthesisService,
    // Le verdict d'un besoin. Il n'a besoin d'AUCUN import de module neuf :
    // il lit par `manager.query` sur le dépôt `ProjectNeedEntity` déjà déclaré
    // ci-dessus (GA-20 — un dépôt injecté doit être déclaré). Un import de
    // `ConsultantsModule` aurait suffi à créer le cycle que ce module évite
    // depuis le début.
    NeedVerdictService,
    NeedContradictionsService,
    NeedCompileTextService,
    NeedCommercialStateService,
    // #4016 L1 — le CA probable du trimestre, calibré à la lecture.
    DealProbabilityService,
  ],
  // `ProjectPipelineService` est exporté depuis #1097 : le studio d'appels
  // d'offres transforme un AO en besoin, et le besoin doit être écrit par le
  // service qui POSSÈDE la table, avec ses invariants (plafond par projet,
  // appartenance à l'espace). Sans cet export, Nest ne résout pas la dépendance
  // du contrôleur RFP et l'application ne DÉMARRE pas — Railway rejette au
  // healthcheck, sans qu'aucun test unitaire ne tombe (les specs construisent
  // les classes à la main). Même famille que GA-20.
  exports: [
    ProjectsService,
    OpenNeedsService,
    ProjectPipelineService,
    NeedCommercialStateService,
    NeedVerdictService,
    // #4016.1d — Laura cite la probabilité calibrée (pont du copilote).
    DealProbabilityService,
  ],
})
export class ProjectsModule {}
