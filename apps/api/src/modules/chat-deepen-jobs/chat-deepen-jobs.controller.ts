import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { JwtGuard } from '../auth/jwt.guard'
import { ChatDeepenJobsService } from './chat-deepen-jobs.service'
import type { ChatDeepenJobStatus, ChatDeepenStopReason } from '../../database/entities/chat-deepen-job.entity'

interface ChatDeepenJobStatusDto {
  id: string
  status: ChatDeepenJobStatus
  label: string
  completedSteps: number
  currentStep: string | null
  /** #3236 (lot W2) — combien de reprises en fond, et la raison NOMMÉE de l'arrêt (`null` tant qu'elle court). */
  autoResumes: number
  stoppedReason: ChatDeepenStopReason | null
  updatedAt: string
}

interface ResolveChatDeepenJobDto {
  userId: string
  conversationId: string
}

interface ReportChatDeepenJobDto {
  userId: string
  conversationId: string
  label: string
  completedSteps: number
  currentStep: string | null
}

@Controller()
export class ChatDeepenJobsController {
  constructor(private readonly jobs: ChatDeepenJobsService) {}

  /**
   * #3236.2 (b, tranche) — ce que l'écran de progression relit au montage
   * (reprise après rechargement) : le dernier job de CETTE personne et CETTE
   * conversation, jamais celui d'une autre (`req.user`, pas un paramètre).
   */
  @UseGuards(JwtGuard)
  @Get('chat/deepen-jobs/latest')
  async latest(
    @Query('conversationId') conversationId: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<ChatDeepenJobStatusDto | null> {
    const job = await this.jobs.getLatestForConversation(user.userId, conversationId)
    if (!job) return null
    return {
      id: job.id,
      status: job.status,
      label: job.label,
      completedSteps: job.completed_steps,
      currentStep: job.current_step,
      autoResumes: job.auto_resumes ?? 0,
      stoppedReason: job.stopped_reason ?? null,
      updatedAt: job.updated_at.toISOString(),
    }
  }

  /**
   * Appelé par l'IA (`chat_deepen_job_report.py`), même garde que
   * `thread.note_unfinished_work` (#3236.2a) : budget épuisé en mode
   * Approfondi, jamais ailleurs.
   */
  @UseGuards(InternalSecretGuard)
  @Post('internal/chat/deepen-jobs')
  async report(@Body() body: ReportChatDeepenJobDto): Promise<{ id: string }> {
    const job = await this.jobs.reportInterrupted({
      userId: body.userId,
      conversationId: body.conversationId,
      label: body.label,
      completedSteps: body.completedSteps,
      currentStep: body.currentStep,
    })
    return { id: job.id }
  }

  /** #3862.1 — l'IA signale qu'un tour Approfondi s'est terminé par une réponse complète. */
  @UseGuards(InternalSecretGuard)
  @Post('internal/chat/deepen-jobs/resolve')
  async resolve(@Body() body: ResolveChatDeepenJobDto): Promise<{ resolved: number }> {
    return { resolved: await this.jobs.resolveForConversation(body.userId, body.conversationId) }
  }
}
