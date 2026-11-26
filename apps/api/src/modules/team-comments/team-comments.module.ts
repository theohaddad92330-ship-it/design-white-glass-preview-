import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TeamCommentEntity } from '../../database/entities/team-comment.entity'
import { ChatConversationEntity } from '../../database/entities/chat-conversation.entity'
import { AccountEntity } from '../../database/entities/account.entity'
import { TeamNotificationsModule } from '../notifications/team/team-notifications.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { TeamCommentsController } from './team-comments.controller'
import { TeamCommentsService } from './team-comments.service'
import { PlanFeaturesModule } from '../plan-features/plan-features.module'

/**
 * Commentaire d'équipe (cockpit manager §10). Module autonome (règle #7) : le
 * retirer supprime `/team-comments` sans toucher au reste. Réutilise
 * `WorkspaceContextService` pour le scope workspace.
 *
 * #1940.6 — `ChatConversationEntity`/`AccountEntity` enregistrées ICI (simple
 * `TypeOrmModule.forFeature`, pas un import de `IaProxyModule`) : le contrôle
 * d'accès #1955.12 se relit sur le compte attaché de la conversation sans
 * ajouter de dépendance service→service (GA-07 inchangé).
 */
@Module({
  imports: [
    // Gating par offre : les commentaires demandent la feature `team_workspace`.
    PlanFeaturesModule,
    TypeOrmModule.forFeature([TeamCommentEntity, ChatConversationEntity, AccountEntity]),
    WorkspaceModule,
    // #4158.17 — une mention prévient la personne mentionnée.
    TeamNotificationsModule,
  ],
  controllers: [TeamCommentsController],
  providers: [TeamCommentsService],
})
export class TeamCommentsModule {}
