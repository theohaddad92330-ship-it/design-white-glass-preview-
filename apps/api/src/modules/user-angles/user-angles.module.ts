import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { UserAngleEntity } from '../../database/entities/user-angle.entity'
import { WorkspaceModule } from '../workspace/workspace.module'
import { UserAnglesController } from './user-angles.controller'
import { UserAnglesService } from './user-angles.service'

/**
 * #4739 — module autonome (Craft rule #7) : « Mes angles ». Le retirer coupe la liste d'angles
 * personnels de « Contacter » ; les angles calculés (`attack_angles`) ne le savent pas.
 */
@Module({
  imports: [WorkspaceModule, TypeOrmModule.forFeature([UserAngleEntity])],
  controllers: [UserAnglesController],
  providers: [UserAnglesService],
})
export class UserAnglesModule {}
