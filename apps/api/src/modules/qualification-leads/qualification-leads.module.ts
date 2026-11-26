import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { QualificationLeadDecisionEntity } from '../../database/entities/qualification-lead-decision.entity'
import { WorkspaceModule } from '../workspace/workspace.module'
import { QualificationLeadsController } from './qualification-leads.controller'
import { QualificationLeadsService } from './qualification-leads.service'

/**
 * #2172 — les décisions prises sur les pistes à qualifier.
 *
 * Module autonome (règle #7) : le retirer fait disparaître l'écartement et la
 * mise en veille, pas la file — elle se dérive des lignes du dossier et
 * continuerait de s'afficher, simplement sans mémoire des refus.
 */
@Module({
  imports: [TypeOrmModule.forFeature([QualificationLeadDecisionEntity]), WorkspaceModule],
  controllers: [QualificationLeadsController],
  providers: [QualificationLeadsService],
  exports: [QualificationLeadsService],
})
export class QualificationLeadsModule {}
