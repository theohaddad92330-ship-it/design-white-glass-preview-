import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ChatEvalSampleEntity } from '../../database/entities/chat-eval-sample.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { AuthModule } from '../auth/auth.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { ChatEvalSamplingController } from './chat-eval-sampling.controller'
import { ChatEvalSamplingService } from './chat-eval-sampling.service'
import { InternalChatEvalSamplesController } from './internal-chat-eval-samples.controller'

/** #2899 — module autonome (règle #7) : le retirer retire l'échantillonnage, rien d'autre. */
@Module({
  imports: [TypeOrmModule.forFeature([WorkspaceEntity, ChatEvalSampleEntity]), AuthModule, WorkspaceModule],
  controllers: [ChatEvalSamplingController, InternalChatEvalSamplesController],
  providers: [ChatEvalSamplingService],
  exports: [ChatEvalSamplingService],
})
export class ChatEvalSamplingModule {}
