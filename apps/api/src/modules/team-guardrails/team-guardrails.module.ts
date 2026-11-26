import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { AccountEntityRow } from '../../database/entities/account-entity.entity'
import { BusinessUnitEntity } from '../../database/entities/business-unit.entity'
import { AccountTeamMemberEntity } from '../../database/entities/account-team-member.entity'
import { AccountTeamScopeEntity } from '../../database/entities/account-team-scope.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { DuplicatePairEntity } from '../../database/entities/duplicate-pair.entity'
import { OutreachMessageEntity } from '../../database/entities/outreach-message.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { ProjectNeedEntity } from '../../database/entities/project-need.entity'
import { ShortlistEntity, ShortlistEntryEntity } from '../../database/entities/shortlist.entity'
import { ProjectEntity } from '../../database/entities/project.entity'
import { SubmissionEntity } from '../../database/entities/submission.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { WorkspaceDoNotContactEntity } from '../../database/entities/workspace-do-not-contact.entity'
import { CrmCoreModule } from '../crm-core/crm-core.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { AccountTeamCatchupController } from './account-team-catchup.controller'
import { AccountTeamCatchupService } from './account-team-catchup.service'
import { TeamGuardrailsController } from './team-guardrails.controller'
import { TeamGuardrailsService } from './team-guardrails.service'

/**
 * #4158 (lot L4) — garde-fous de collaboration entre collègues. Module autonome
 * (craft rule n°7) : le retirer retire ces bandeaux, pas le produit.
 */
@Module({
  imports: [
    WorkspaceModule,
    CrmCoreModule,
    TypeOrmModule.forFeature([
      AccountEntity,
      AccountEntityRow,
      BusinessUnitEntity,
      AccountTeamMemberEntity,
      AccountTeamScopeEntity,
      ContactEntity,
      DuplicatePairEntity,
      OutreachMessageEntity,
      ProfileEntity,
      ProjectEntity,
      ProjectNeedEntity,
      ShortlistEntity,
      ShortlistEntryEntity,
      SubmissionEntity,
      UserActionEntity,
      WorkspaceDoNotContactEntity,
      WorkspaceMemberEntity,
    ]),
  ],
  controllers: [TeamGuardrailsController, AccountTeamCatchupController],
  providers: [TeamGuardrailsService, AccountTeamCatchupService],
})
export class TeamGuardrailsModule {}
