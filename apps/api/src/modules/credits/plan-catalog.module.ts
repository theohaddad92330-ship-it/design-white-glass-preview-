import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { PlanDefinitionEntity } from '../../database/entities/plan-definition.entity'
import { PlanCatalogService } from './plan-catalog.service'

/**
 * Provides the DB-backed {@link PlanCatalogService} (single cached instance) to
 * every module that used to read the `PLAN_CONFIG` const — credits (enforcement),
 * admin (assign + edit), workspace (seats) and analytics (MRR). Exported so those
 * modules share ONE in-memory cache; importing it is all the wiring they need.
 */
@Module({
  imports: [TypeOrmModule.forFeature([PlanDefinitionEntity])],
  providers: [PlanCatalogService],
  exports: [PlanCatalogService],
})
export class PlanCatalogModule {}
