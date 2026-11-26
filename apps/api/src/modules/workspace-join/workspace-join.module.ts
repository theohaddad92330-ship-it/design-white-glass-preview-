import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { EsnProfileEntity } from '../../database/entities/esn-profile.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { WorkspaceJoinRequestEntity } from '../../database/entities/workspace-join-request.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceModule } from '../workspace/workspace.module'
import { WorkspaceJoinController } from './workspace-join.controller'
import { WorkspaceJoinService } from './workspace-join.service'

/**
 * #2016 — rejoindre un espace existant. Module autonome (règle #7) : le
 * retirer supprime `/workspace-join-requests/*` et l'encart d'onboarding
 * retombe sur le parcours d'avant (la lecture en échec n'affiche rien).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      WorkspaceJoinRequestEntity,
      WorkspaceEntity,
      WorkspaceMemberEntity,
      ProfileEntity,
      EsnProfileEntity,
    ]),
    WorkspaceModule,
  ],
  controllers: [WorkspaceJoinController],
  providers: [WorkspaceJoinService],
})
export class WorkspaceJoinModule {}
