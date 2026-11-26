import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AnalysisBatchEntity } from '../../database/entities/analysis-batch.entity'
import { AnalysisBatchItemEntity } from '../../database/entities/analysis-batch-item.entity'
import { AnalysisModule } from '../analysis/analysis.module'
import { BusinessUnitModule } from '../business-unit/business-unit.module'
import { CompaniesModule } from '../companies/companies.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { AnalysisBatchesController } from './analysis-batches.controller'
import { AnalysisBatchesService } from './analysis-batches.service'

/**
 * #2293.5 — le lot d'analyses multi-comptes. Module autonome (règle #7) : le
 * retirer supprime `/analysis-batches/*` sans toucher à l'analyse unitaire,
 * qu'il ne fait qu'appeler.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([AnalysisBatchEntity, AnalysisBatchItemEntity]),
    AnalysisModule,
    BusinessUnitModule,
    CompaniesModule,
    WorkspaceModule,
  ],
  controllers: [AnalysisBatchesController],
  providers: [AnalysisBatchesService],
  // #4611 — le pont copilote LIT l'état des lots (jamais il ne les lance).
  exports: [AnalysisBatchesService],
})
export class AnalysisBatchesModule {}
