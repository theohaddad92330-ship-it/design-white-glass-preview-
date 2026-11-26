import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { BetaFeedbackEntity } from '../../database/entities/beta-feedback.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { WorkspaceModule } from '../workspace/workspace.module'
import { FeedbackController } from './feedback.controller'
import { FeedbackService } from './feedback.service'
import { GithubIssueService } from './github-issue.service'
import { InternalFeedbackController } from './internal-feedback.controller'

@Module({
  imports: [
    // #1960.10 — `WorkspaceContextService.isDemoWorkspace` : le contrôleur refuse
    // un signalement venu d'une salle de démonstration (même porte que `RagModule`).
    WorkspaceModule,
    TypeOrmModule.forFeature([
      BetaFeedbackEntity,
      // Lecture seule (#1658.2) : `beta_feedback` ne porte AUCUN `workspace_id`,
      // donc « l'espace qui a remonté » se résout par l'auteur. Le module
      // `workspaces` reste propriétaire des deux tables ; un repository injecté
      // doit être DÉCLARÉ ici (GA-20), sinon le graphe ne tombe qu'au démarrage.
      WorkspaceMemberEntity,
      WorkspaceEntity,
    ]),
  ],
  controllers: [FeedbackController, InternalFeedbackController],
  providers: [FeedbackService, GithubIssueService, InternalSecretGuard],
  exports: [FeedbackService],
})
export class FeedbackModule {}
