import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AnalysisBatchEntity } from '../../database/entities/analysis-batch.entity'
import { AnalysisBatchItemEntity } from '../../database/entities/analysis-batch-item.entity'
import { IntegrationSyncRunEntity } from '../../database/entities/integration-sync-run.entity'
import { OrgEnrichmentJobEntity } from '../../database/entities/org-enrichment-job.entity'
import { UniversalImportJobEntity } from '../../database/entities/universal-import-job.entity'
import { WorkflowRunEntity } from '../../database/entities/workflow-run.entity'
import { ChatTurnRegistry } from '../chat-turns/chat-turn-registry'
import { ChatTurnsModule } from '../chat-turns/chat-turns.module'
import { TypeormWorkProgressReader } from './work-progress.reader'
import { WORK_PROGRESS_CHAT_TURNS, WORK_PROGRESS_READER, WorkProgressService } from './work-progress.service'

/**
 * #4611 — l'état du travail lancé, en LECTURE SEULE. Module autonome (règle #7) : le retirer supprime
 * l'outil de lecture de Laura, rien d'autre — aucune écriture, aucun service d'un autre module (GA-07).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      AnalysisBatchEntity,
      AnalysisBatchItemEntity,
      UniversalImportJobEntity,
      OrgEnrichmentJobEntity,
      IntegrationSyncRunEntity,
      // Lot L6 — les jobs de Laura (lecture seule).
      WorkflowRunEntity,
    ]),
    // #4967 (lot L6) — les recherches de conversation en cours (registre partagé avec le chat).
    ChatTurnsModule,
  ],
  providers: [
    TypeormWorkProgressReader,
    { provide: WORK_PROGRESS_READER, useExisting: TypeormWorkProgressReader },
    { provide: WORK_PROGRESS_CHAT_TURNS, useExisting: ChatTurnRegistry },
    WorkProgressService,
  ],
  exports: [WorkProgressService],
})
export class WorkProgressModule {}
