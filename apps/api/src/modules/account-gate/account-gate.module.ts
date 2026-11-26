import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { AccountParkReasonEntity } from '../../database/entities/account-park-reason.entity'
import { DecisionGatesModule } from '../decision-gates/decision-gates.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { AccountGateController } from './account-gate.controller'
import { AccountGateService } from './account-gate.service'

/**
 * La porte G1 (BEL-CRM-102). Module autonome (règle #7) : le retirer rend au
 * compte son état de porte figé, sans rien casser d'autre — les colonnes
 * redeviennent simplement inutilisées.
 */
@Module({
  imports: [TypeOrmModule.forFeature([AccountEntity, AccountParkReasonEntity]), DecisionGatesModule, WorkspaceModule],
  controllers: [AccountGateController],
  providers: [AccountGateService],
  exports: [AccountGateService],
})
export class AccountGateModule {}
