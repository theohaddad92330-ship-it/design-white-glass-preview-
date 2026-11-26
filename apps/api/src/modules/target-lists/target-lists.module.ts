import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TargetListEntity } from '../../database/entities/target-list.entity'
import { TargetListItemEntity } from '../../database/entities/target-list-item.entity'
import { AccountFactsModule } from '../account-facts/account-facts.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { TargetListsController } from './target-lists.controller'
import { TargetListsService } from './target-lists.service'

/**
 * #2155.13 — « Mes cibles ». Module autonome (règle #7) : le retirer supprime
 * `/target-lists/*` sans toucher aux comptes ni aux contacts qu'il référence.
 */
@Module({
  imports: [TypeOrmModule.forFeature([TargetListEntity, TargetListItemEntity]), WorkspaceModule, AccountFactsModule],
  controllers: [TargetListsController],
  providers: [TargetListsService],
})
export class TargetListsModule {}
