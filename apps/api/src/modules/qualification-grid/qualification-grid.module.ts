import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import {
  AccountQualificationEntity,
  QualificationCriterionEntity,
  QualificationGridEntity,
} from '../../database/entities/qualification-grid.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { WorkspaceModule } from '../workspace/workspace.module'
import { QualificationEvaluatorClient } from './qualification-evaluator.client'
import { QualificationGridController } from './qualification-grid.controller'
import { QualificationGridService } from './qualification-grid.service'
import { ImportedQualificationSignals, QUALIFICATION_SIGNALS } from './qualification-signals'

/**
 * #3755 — la grille de qualification propre à l'espace. Module autonome (craft
 * rule 7) : le retirer coupe la grille et son verdict ; le worker d'analyse
 * l'appelle en `@Optional()`, et sans grille le verdict affiché est celui d'avant.
 */
@Module({
  imports: [
    WorkspaceModule,
    TypeOrmModule.forFeature([
      QualificationGridEntity,
      QualificationCriterionEntity,
      AccountQualificationEntity,
      ContactEntity,
    ]),
  ],
  controllers: [QualificationGridController],
  providers: [
    QualificationGridService,
    QualificationEvaluatorClient,
    // #3755.8 — tier (#3753) et niveau décideur (#3754) lus en SQL.
    { provide: QUALIFICATION_SIGNALS, useClass: ImportedQualificationSignals },
  ],
  exports: [QualificationGridService],
})
export class QualificationGridModule {}
