import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AccessFactEntity } from '../../database/entities/access-fact.entity'
import { AccountEntityRow } from '../../database/entities/account-entity.entity'
import { AccountEntity } from '../../database/entities/account.entity'
import { ConsultantExperienceEntity } from '../../database/entities/consultant-experience.entity'
import { AccountEntitiesModule } from '../account-entities/account-entities.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { AccountAccessController } from './account-access.controller'
import { AccountAccessService } from './account-access.service'

/**
 * L'accès à un compte — verrouillage, modes d'entrée, coût.
 *
 * Module autonome (règle #7). Le retirer retire l'onglet Accès et rien d'autre.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([AccessFactEntity, AccountEntity, AccountEntityRow, ConsultantExperienceEntity]),
    WorkspaceModule,
    AccountEntitiesModule,
  ],
  controllers: [AccountAccessController],
  providers: [AccountAccessService],
  exports: [AccountAccessService],
})
export class AccountAccessModule {}
