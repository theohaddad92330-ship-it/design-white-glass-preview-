import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import {
  BusinessUnitAccessRequestEntity,
  BusinessUnitEntity,
  BusinessUnitMemberEntity,
} from '../../database/entities/business-unit.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { WorkspaceRulesEntity } from '../../database/entities/workspace-rules.entity'
import { WorkspaceModule } from '../workspace/workspace.module'
import { BusinessUnitController } from './business-unit.controller'
import { BusinessUnitService } from './business-unit.service'

/**
 * La couche BU / agence (#2005.3). Module autonome (règle #7) : le retirer
 * supprime `/business-units/*` et rend `BusinessUnitService` introuvable —
 * auquel cas `AccountsController` LÈVE au lieu de servir tout l'espace sans
 * cloisonnement. Un module de sécurité qu'on peut retirer en silence n'en est
 * pas un.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      BusinessUnitEntity,
      BusinessUnitMemberEntity,
      BusinessUnitAccessRequestEntity,
      WorkspaceMemberEntity,
      // #2081.14 — la règle d'espace « comptes d'une unité : privés » PRIME
      // sur le niveau d'accès individuel ; `scopeFor` la lit à chaque décision.
      WorkspaceRulesEntity,
    ]),
    WorkspaceModule,
  ],
  controllers: [BusinessUnitController],
  providers: [BusinessUnitService],
  exports: [BusinessUnitService],
})
export class BusinessUnitModule {}
