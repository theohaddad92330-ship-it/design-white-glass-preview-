import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { WorkspaceModule } from '../workspace/workspace.module'
import { WorkspaceMergeController } from './workspace-merge.controller'
import { WORKSPACE_MERGE_JOB_OPTIONS, WORKSPACE_MERGE_QUEUE } from './workspace-merge.queue'
import { WorkspaceMergeService } from './workspace-merge.service'
import { SqlWorkspaceMergeStore } from './workspace-merge.sql-store'
import { WORKSPACE_MERGE_STORE } from './workspace-merge.store'
import { WorkspaceMergeWorker } from './workspace-merge.worker'

/**
 * #4158.57 — rapatrier l'espace personnel dans l'espace ESN rejoint. Module autonome (règle #7) : le
 * retirer retire `/workspace-merge/*` et la carte de Réglages › Espace, rien d'autre.
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: WORKSPACE_MERGE_QUEUE, defaultJobOptions: WORKSPACE_MERGE_JOB_OPTIONS }),
    WorkspaceModule,
  ],
  controllers: [WorkspaceMergeController],
  providers: [
    WorkspaceMergeService,
    WorkspaceMergeWorker,
    { provide: WORKSPACE_MERGE_STORE, useClass: SqlWorkspaceMergeStore },
  ],
})
export class WorkspaceMergeModule {}
