import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AccountEntity } from '../../../database/entities/account.entity'
import { NotificationPreferenceEntity } from '../../../database/entities/notification-preference.entity'
import { ProfileEntity } from '../../../database/entities/profile.entity'
import { MailerModule } from '../../mailer/mailer.module'
import { WorkspaceModule } from '../../workspace/workspace.module'
import { NotificationsCoreModule } from '../notifications-core.module'
import { TeamInboxDerivedService } from './team-inbox-derived.service'
import { TeamNotificationsService } from './team-notifier.service'

/**
 * #4158.14 — notifications ENTRE COLLÈGUES (assignation, délégation, mention) et
 * entrées dérivées de la boîte. Module autonome (règle #7) : le retirer ne
 * casse que ces notifications, jamais le geste qui les provoque (best-effort).
 */
@Module({
  imports: [
    NotificationsCoreModule,
    WorkspaceModule,
    MailerModule,
    TypeOrmModule.forFeature([AccountEntity, NotificationPreferenceEntity, ProfileEntity]),
  ],
  providers: [TeamNotificationsService, TeamInboxDerivedService],
  exports: [TeamNotificationsService, TeamInboxDerivedService],
})
export class TeamNotificationsModule {}
