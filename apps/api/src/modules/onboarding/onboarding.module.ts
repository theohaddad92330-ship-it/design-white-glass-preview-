import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AccountFeedbackEntity } from '../../database/entities/account-feedback.entity'
import { AnalysisRunEntity } from '../../database/entities/analysis-run.entity'
import { CrmConnectionEntity } from '../../database/entities/crm-connection.entity'
import { GoogleConnectionEntity } from '../../database/entities/google-connection.entity'
import { ImportSessionEntity } from '../../database/entities/import-session.entity'
import { MicrosoftConnectionEntity } from '../../database/entities/microsoft-connection.entity'
import { OnboardingStageDefinitionEntity } from '../../database/entities/onboarding-stage-definition.entity'
import { ProductEventEntity } from '../../database/entities/product-event.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { FramingDecisionEntity } from '../../database/entities/framing-decision.entity'
import { UserOnboardingStateEntity } from '../../database/entities/user-onboarding-state.entity'
import { UserOnboardingTransitionEntity } from '../../database/entities/user-onboarding-transition.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceInvitationEntity } from '../../database/entities/workspace-invitation.entity'
import { AuthModule } from '../auth/auth.module'
import { EsnProfileModule } from '../esn-profile/esn-profile.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { ActivationService } from './activation.service'
import { FramingService } from './framing.service'
import { OnboardingController } from './onboarding.controller'
import { OnboardingService } from './onboarding.service'

@Module({
  imports: [
    AuthModule,
    EsnProfileModule,
    // #2077.9 — le 8e jalon (« premier collègue invité ») lit
    // `WorkspaceTeamService.canInviteColleague` (rôle + sièges) : une seule
    // dérivation, jamais recalculée ici (module-boundaries.spec.ts, +1 justifié).
    WorkspaceModule,
    TypeOrmModule.forFeature([
      UserOnboardingStateEntity,
      // #2004.12 — le journal d'audit des transitions d'état.
      UserOnboardingTransitionEntity,
      // Théo O onboarding-relecture.N1 — la décision par orientation du cadrage.
      FramingDecisionEntity,
      OnboardingStageDefinitionEntity,
      // Activation checklist read-only sources (no writes from this module).
      // #2077.3 — le 1er jalon lit désormais la VALIDATION du profil.
      ProfileEntity,
      AnalysisRunEntity,
      ProductEventEntity,
      UserActionEntity,
      // #1810 — le 6e jalon (`tool_connected`), lui aussi en LECTURE seule.
      GoogleConnectionEntity,
      MicrosoftConnectionEntity,
      CrmConnectionEntity,
      // #2077.6 — le 7e jalon (« première correction »), en LECTURE seule.
      AccountFeedbackEntity,
      // #2077.9 — le 8e jalon (« premier collègue invité »), en LECTURE seule.
      // #2014.3/.7 — et désormais aussi lue par `getState` pour nommer
      // l'espace REJOINT (l'autre sens : l'invitation ACCEPTÉE par CET
      // utilisateur, pas celles qu'il a envoyées).
      WorkspaceInvitationEntity,
      // #2014.3/.7 — le nom de l'espace rejoint. Entité partagée, jamais le
      // service `workspace` (hors du cliquet GA-07).
      WorkspaceEntity,
      // #2004.19 — la session d'import EN COURS, en LECTURE seule : un import
      // long rend la reprise au bon endroit, sans qu'`ImportModule` ait besoin
      // d'importer ce module en retour (entité partagée, jamais un service).
      ImportSessionEntity,
    ]),
  ],
  controllers: [OnboardingController],
  providers: [OnboardingService, ActivationService, FramingService],
  exports: [OnboardingService],
})
export class OnboardingModule {}
