import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DiscoverCandidateFeedbackEntity } from '../../database/entities/discover-candidate-feedback.entity'
import { PlanFeaturesModule } from '../plan-features/plan-features.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { DiscoverCandidateFeedbackController } from './discover-candidate-feedback.controller'
import { DiscoverCandidateFeedbackService } from './discover-candidate-feedback.service'

/**
 * #3671.2bis — le retour serveur « Mauvaise entreprise » d'un candidat
 * Découvrir. Module autonome (règle #7) — le retirer supprime le geste sans
 * toucher à Découvrir lui-même : `DiscoverCandidateFeedbackService` est
 * exporté pour que `IaProxyModule` (un contrôleur compose légitimement
 * plusieurs domaines, GA-07) puisse exclure ces SIREN des réponses.
 */
@Module({
  imports: [PlanFeaturesModule, WorkspaceModule, TypeOrmModule.forFeature([DiscoverCandidateFeedbackEntity])],
  controllers: [DiscoverCandidateFeedbackController],
  providers: [DiscoverCandidateFeedbackService],
  exports: [DiscoverCandidateFeedbackService],
})
export class DiscoverFeedbackModule {}
