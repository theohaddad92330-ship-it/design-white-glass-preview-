import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { AccountTeamMemberEntity } from '../../database/entities/account-team-member.entity'
import { AccountTeamScopeEntity } from '../../database/entities/account-team-scope.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { TeamNotificationsModule } from '../notifications/team/team-notifications.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { AccountAssignmentService } from './account-assignment.service'
import { ContactAssignmentService } from './contact-assignment.service'
import {
  AssignmentController,
  ContactAssignmentController,
  ContactDistributionController,
} from './assignment.controller'

/**
 * Portefeuille — attribution d'un compte (`accounts.assigned_to`) et d'une
 * sélection de contacts (`contacts.assigned_to`).
 *
 * Self-contained (craft rule 7): it owns `PATCH /accounts/:id/assign` and
 * `PATCH /contacts/assign`, reads its rows through its own repository handles and
 * resolves the caller's workspace + role via {@link WorkspaceContextService}. It
 * deliberately does NOT depend on `AccountsModule` / `ContactsModule` — nothing
 * here needs the analysis or enrichment pipelines, and staying off those services
 * keeps this feature removable in one deletion.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([AccountEntity, ContactEntity, AccountTeamMemberEntity, AccountTeamScopeEntity]),
    WorkspaceModule,
    TeamNotificationsModule,
  ],
  controllers: [AssignmentController, ContactAssignmentController, ContactDistributionController],
  providers: [AccountAssignmentService, ContactAssignmentService],
})
export class AssignmentModule {}
