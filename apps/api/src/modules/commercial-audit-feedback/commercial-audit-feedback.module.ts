import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CommercialAuditFeedbackEntity } from '../../database/entities/commercial-audit-feedback.entity'
import { WorkspaceModule } from '../workspace/workspace.module'
import { CommercialAuditFeedbackController } from './commercial-audit-feedback.controller'
import { CommercialAuditFeedbackService } from './commercial-audit-feedback.service'

/**
 * #2075.12 / #2075.13 (épopée #2774) — module autonome (règle #7) : le
 * retirer supprime la note personnelle sur l'audit commercial, rien d'autre.
 * L'audit lui-même reste une dérivation pure côté web (`build-audit.ts`).
 */
@Module({
  imports: [WorkspaceModule, TypeOrmModule.forFeature([CommercialAuditFeedbackEntity])],
  controllers: [CommercialAuditFeedbackController],
  providers: [CommercialAuditFeedbackService],
})
export class CommercialAuditFeedbackModule {}
