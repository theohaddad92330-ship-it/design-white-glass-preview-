import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { AccountEntityRow } from '../../database/entities/account-entity.entity'
import { ActionPlanEntity } from '../../database/entities/action-plan.entity'
import { ApprovalRequestEntity } from '../../database/entities/approval-request.entity'
import { AttackAngleEntity } from '../../database/entities/attack-angle.entity'
import { ConsultantEntity } from '../../database/entities/consultant.entity'
import { DemoLeadEntity } from '../../database/entities/demo-lead.entity'
import { BackofficeAlertDispatchService } from '../backoffice-alerts/backoffice-alert-dispatch.service'
import { DemoLeadService } from './demo-lead.service'
import { ConsultantDocumentEntity } from '../../database/entities/consultant-document.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
// #3104 — la conversation d'exemple du panneau « Conversations » de /chat.
import { ChatMessageEntity } from '../../database/entities/chat-message.entity'
import { MemberObjectiveEntity } from '../../database/entities/member-objective.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { RfpEntity } from '../../database/entities/rfp.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { WorkflowRunEntity } from '../../database/entities/workflow-run.entity'
import { RagDocumentEntity } from '../../database/entities/rag-document.entity'
import { ActivityEntity } from '../../database/entities/activity.entity'
import { TaskEntity } from '../../database/entities/task.entity'
import { ConsultantSkillEntity } from '../../database/entities/consultant-skill.entity'
import { ConsultantExperienceEntity } from '../../database/entities/consultant-experience.entity'
import { TalentPreparedMessageEntity } from '../../database/entities/talent-prepared-message.entity'
import { NoteEntity } from '../../database/entities/note.entity'
import { UserFavoriteEntity } from '../favorites/user-favorite.entity'
import { ProjectsModule } from '../projects/projects.module'
// BEL-SC-224 (#3253, P0) — le diagnostic du maillon faible EST calculé pour
// la salle de démonstration, jamais deviné : `DemoSeedService` appelle le
// MÊME service qu'un espace réel, sur les données qu'il vient de semer.
import { WeakestLinkDiagnosisModule } from '../weakest-link-diagnosis/weakest-link-diagnosis.module'
import { StorageModule } from '../storage/storage.module'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { NotificationPreferenceEntity } from '../../database/entities/notification-preference.entity'
import { AuthModule } from '../auth/auth.module'
import { SessionRegistryModule } from '../auth/session-registry.module'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { DemoController } from './demo.controller'
import { InternalDemoLeadsController } from './internal-demo-leads.controller'
import { DEMO_OPERATOR_ALERT } from './demo-alert-token'
import { DemoLinkService } from './demo-link.service'
import { DemoPoolService } from './demo-pool.service'
import { DemoResetService } from './demo-reset.service'
import { DemoSeedService } from './demo-seed.service'

/**
 * Demo mode (C1 Théo) — provisioning, golden-dataset seeding and the SHARED
 * demo link for `is_demo` workspaces.
 *
 * Two entry points: the admin backoffice creates the FIRST space (behind
 * `InternalSecretGuard`, importing this module for {@link DemoSeedService}),
 * and {@link DemoController} redeems the public link — leasing the visitor a
 * demo room of their own ({@link DemoPoolService}), wiped and re-seeded while it
 * was free ({@link DemoResetService}), before minting a session. Rooms beyond
 * the first are provisioned on demand, up to `DEMO_POOL_SIZE`.
 *
 * Self-contained: removing it changes no other module's behaviour (the demo
 * guards in credits/analysis read the workspace flag directly and degrade to
 * the real path when no workspace is demo), and with no `DEMO_LINK_TOKEN` set
 * the controller refuses outright.
 */
@Module({
  imports: [
    // For SessionService — the demo link mints a session the same way the 2FA
    // challenge does (single-use admin magic link, consumed server-side).
    AuthModule,
    SessionRegistryModule,
    // Le semis dépose de VRAIS fichiers (31/08/2026) : sans eux, les deux
    // écrans de pièces jointes s'ouvriraient devant un prospect avec un bouton
    // qui ne mène nulle part. Sens unique — le stockage ne nous importe pas.
    StorageModule,
    TypeOrmModule.forFeature([
      WorkspaceEntity,
      WorkspaceMemberEntity,
      ProfileEntity,
      AccountEntity,
      AccountEntityRow,
      // #2150.14/.18 — le favori GOLDEN de la salle (Société Générale), dans `DemoSeedService.seedWorkspace`.
      UserFavoriteEntity,
      ContactEntity,
      AttackAngleEntity,
      ActionPlanEntity,
      NotificationPreferenceEntity,
      ConsultantEntity,
      // #2569.4 — les documents d'origine du lot N (import ZIP/messagerie).
      ConsultantDocumentEntity,
      UserActionEntity,
      MemberObjectiveEntity,
      WorkflowRunEntity,
      RagDocumentEntity,
      NoteEntity,
      ActivityEntity,
      TaskEntity,
      ConsultantSkillEntity,
      ConsultantExperienceEntity,
      // #2185.51 — les brouillons de message, seedés pour montrer le geste.
      TalentPreparedMessageEntity,
      // #2571.5 — l'appel d'offres scripté de la salle (`DemoSeedService.seedRfp`).
      RfpEntity,
      // #2705 — les prospects du formulaire obligatoire du lien de démo.
      DemoLeadEntity,
      // #3104 — la conversation d'exemple du panneau « Conversations » de /chat.
      ChatMessageEntity,
      // #2946 — la demande d'approbation EN ATTENTE derrière la tâche
      // `source = 'action_os_approval'` (`DemoSeedService.seedWorkspace`).
      ApprovalRequestEntity,
    ]),
    // Le seed matérialise les projets avec la MÊME projection qu'en production.
    ProjectsModule,
    // BEL-SC-224 (#3253, P0) — même discipline : le diagnostic de la salle
    // est CALCULÉ, jamais une ligne écrite à la main.
    WeakestLinkDiagnosisModule,
  ],
  controllers: [DemoController, InternalDemoLeadsController],
  providers: [
    DemoSeedService,
    DemoResetService,
    DemoPoolService,
    DemoLinkService,
    DemoLeadService,
    // #2707 — `BackofficeAlertsModule` n'exporte pas ce service, et l'importer
    // ouvrirait un cycle (`BackofficeAlertsModule` → `AdminModule` →
    // `DemoModule`). Il est fourni ici directement — sans état interne hors
    // Redis/env, une seconde instance ne divise rien (voir son docblock).
    BackofficeAlertDispatchService,
    // #4035.3 — le pool reçoit l'alerte par jeton (GA-07), pas par import.
    { provide: DEMO_OPERATOR_ALERT, useExisting: BackofficeAlertDispatchService },
    // #2706 — même patron que `/internal/feedback` : le secret partagé garde
    // la vue interne des prospects.
    InternalSecretGuard,
  ],
  exports: [DemoSeedService, DemoResetService],
})
export class DemoModule {}
