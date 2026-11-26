import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DecisionGateCrossingEntity } from '../../database/entities/decision-gate-crossing.entity'
import { ActivitiesModule } from '../activities/activities.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { DecisionGatesController } from './decision-gates.controller'
import { DecisionGatesService } from './decision-gates.service'

/**
 * Le journal des portes de décision. Module autonome (règle #7) : le retirer
 * fait disparaître le journal sans toucher aux gestes qu'il observe — chaque
 * appelant l'injecte en `@Optional()`, et sans lui le geste part comme avant.
 *
 * C'est délibéré et pas seulement prudent : une décision métier prise par un
 * humain ne doit jamais échouer parce que son journal est indisponible.
 */
@Module({
  imports: [TypeOrmModule.forFeature([DecisionGateCrossingEntity]), ActivitiesModule, WorkspaceModule],
  controllers: [DecisionGatesController],
  providers: [DecisionGatesService],
  exports: [DecisionGatesService],
})
export class DecisionGatesModule {}
