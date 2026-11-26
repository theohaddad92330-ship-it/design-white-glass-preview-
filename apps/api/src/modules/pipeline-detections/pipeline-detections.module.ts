import { Module } from '@nestjs/common'
import { ConsultantsModule } from '../consultants/consultants.module'
import { PlanFeaturesModule } from '../plan-features/plan-features.module'
import { ProjectsModule } from '../projects/projects.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { PipelineDetectionsController } from './pipeline-detections.controller'
import { PipelineDetectionsService } from './pipeline-detections.service'
import { PipelineDetectionsSweeper } from './pipeline-detections.sweeper'

/**
 * #4016 L6 — le pipe « détecté, à revoir ». Indépendant (règle n°7) : aucun
 * autre module n'en dépend ; le retirer coupe la détection, rien d'autre.
 */
@Module({
  imports: [WorkspaceModule, ProjectsModule, ConsultantsModule, PlanFeaturesModule],
  controllers: [PipelineDetectionsController],
  providers: [PipelineDetectionsService, PipelineDetectionsSweeper],
})
export class PipelineDetectionsModule {}
