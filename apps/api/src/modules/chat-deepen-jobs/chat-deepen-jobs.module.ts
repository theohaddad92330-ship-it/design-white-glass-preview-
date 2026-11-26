import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ChatDeepenJobEntity } from '../../database/entities/chat-deepen-job.entity'
import { ChatDeepenJobsController } from './chat-deepen-jobs.controller'
import { ChatDeepenJobsReaper } from './chat-deepen-jobs.reaper'
import { ChatDeepenJobsService } from './chat-deepen-jobs.service'

/**
 * #3236.2 (b, tranche) — module autonome (règle 7) : le retirer rend
 * `/chat/deepen-jobs/latest` et `/internal/chat/deepen-jobs` absents, sans
 * toucher au chemin partagé `chat_orchestrator.py` (l'appel IA y est best-effort,
 * voir `chat_deepen_job_report.py`).
 */
@Module({
  imports: [TypeOrmModule.forFeature([ChatDeepenJobEntity])],
  controllers: [ChatDeepenJobsController],
  providers: [ChatDeepenJobsService, ChatDeepenJobsReaper],
  exports: [ChatDeepenJobsService],
})
export class ChatDeepenJobsModule {}
