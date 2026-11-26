import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { FactoringContractEntity } from '../../database/entities/factoring-contract.entity'
import { FactoringSettlementEntity } from '../../database/entities/factoring-settlement.entity'
import { ReceivableAssignmentEntity } from '../../database/entities/receivable-assignment.entity'
import { WorkspaceModule } from '../workspace/workspace.module'
import { FactoringController } from './factoring.controller'
import { FactoringService } from './factoring.service'

/**
 * LA CESSION DE CRÉANCE — le module (31/08/2026).
 *
 * Autonome, comme chaque module de ce dépôt : le retirer de `AppModule` retire
 * l'écran des cessions et ne casse rien d'autre. Il ne fournit rien à personne
 * (`exports` vide, à dessein) — la facturation n'a pas à savoir qu'un
 * affacturage existe, et lui exporter ce service ouvrirait un couplage que
 * GA-07 compte, dans un cliquet exactement au plafond.
 *
 * `WorkspaceModule` est importé pour `WorkspaceContextService` et
 * `WorkspacePermissionGuard`, tous deux exportés par lui (GA-42 : un service
 * injecté par un contrôleur doit être résolvable).
 */
@Module({
  imports: [
    WorkspaceModule,
    TypeOrmModule.forFeature([FactoringContractEntity, ReceivableAssignmentEntity, FactoringSettlementEntity]),
  ],
  controllers: [FactoringController],
  providers: [FactoringService],
})
export class FactoringModule {}
