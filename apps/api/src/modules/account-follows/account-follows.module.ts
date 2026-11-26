import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { AccountsModule } from '../accounts/accounts.module'
import { BusinessUnitModule } from '../business-unit/business-unit.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { AccountFollowEntity } from './account-follow.entity'
import { AccountFollowsController } from './account-follows.controller'
import { AccountFollowsService } from './account-follows.service'

/**
 * #4267 — le suivi explicite d'un compte, par utilisateur (3 au plus). Autonome (règle #7) : le retirer
 * retire les routes ; les lecteurs de veille lisent la table en SQL (`activeFollowExists`) et ne
 * suivraient alors plus rien — le coût de veille tombe à zéro, rien ne casse.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([AccountFollowEntity, AccountEntity]),
    AccountsModule,
    WorkspaceModule,
    BusinessUnitModule,
  ],
  controllers: [AccountFollowsController],
  providers: [AccountFollowsService],
})
export class AccountFollowsModule {}
