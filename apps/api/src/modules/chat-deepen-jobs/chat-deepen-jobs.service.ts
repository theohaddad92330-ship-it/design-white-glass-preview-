import { randomUUID } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, LessThan, Repository } from 'typeorm'
import { ChatDeepenJobEntity, type ChatDeepenStopReason } from '../../database/entities/chat-deepen-job.entity'

const LABEL_MAX = 500
const NON_TERMINAL_STATUSES = ['queued', 'running'] as const

interface ReportInterruptedParams {
  userId: string
  conversationId: string
  label: string
  completedSteps: number
  currentStep: string | null
}

/**
 * #3236.2 (b, tranche) — la persistance d'un approfondissement interrompu.
 *
 * `reportInterrupted` est appelé par l'IA (`chat_deepen_job_report.py`)
 * exactement là où `thread.note_unfinished_work` l'est déjà (#3236.2a) :
 * même garde (`plan.reason == "mode_approfondi"` et budget épuisé), même
 * discipline best-effort côté appelant. UNE conversation en cours d'étude
 * tient UNE ligne : une seconde coupure de la MÊME étude met à jour la même
 * ligne plutôt que d'en ouvrir une autre (sinon l'écran listerait N lignes
 * pour un seul fil de travail).
 */
@Injectable()
export class ChatDeepenJobsService {
  constructor(@InjectRepository(ChatDeepenJobEntity) private readonly jobs: Repository<ChatDeepenJobEntity>) {}

  async reportInterrupted(params: ReportInterruptedParams): Promise<ChatDeepenJobEntity> {
    const existing = await this.jobs.findOne({
      where: { user_id: params.userId, conversation_id: params.conversationId, status: In(NON_TERMINAL_STATUSES) },
      order: { updated_at: 'DESC' },
    })
    const label = params.label.slice(0, LABEL_MAX)
    const entity: ChatDeepenJobEntity =
      existing ??
      ({
        id: randomUUID(),
        user_id: params.userId,
        conversation_id: params.conversationId,
        label,
        status: 'queued',
        completed_steps: 0,
        current_step: null,
        auto_resumes: 0,
        stopped_reason: null,
      } as ChatDeepenJobEntity)
    entity.label = label
    entity.status = 'queued'
    entity.completed_steps = params.completedSteps
    entity.current_step = params.currentStep
    return this.jobs.save(entity)
  }

  /**
   * #3862.1 — la personne a obtenu la réponse COMPLÈTE : l'étude interrompue de
   * ce fil est terminée (`done`). Seules les lignes non terminales de CETTE
   * personne et CE fil sont touchées ; un `unknown` (reprise abandonnée) reste tel quel.
   */
  async resolveForConversation(userId: string, conversationId: string): Promise<number> {
    const result = await this.jobs.update(
      { user_id: userId, conversation_id: conversationId, status: In(NON_TERMINAL_STATUSES) },
      { status: 'done' },
    )
    return result.affected ?? 0
  }

  /**
   * #3236 (lot W2) — la plus ancienne étude interrompue (`queued`) dont la dernière coupure est
   * assez ancienne pour que le tour interrompu soit réglé. `null` = rien à reprendre.
   */
  async findQueuedBefore(settledBefore: Date): Promise<ChatDeepenJobEntity | null> {
    return this.jobs.findOne({
      where: { status: 'queued', updated_at: LessThan(settledBefore) },
      order: { updated_at: 'ASC' },
    })
  }

  /**
   * #3236 (lot W2) — réclamer UNE reprise : `queued` → `running`, +1 reprise. La clause `WHERE` porte
   * le garde (GA-76, sans verrou) : deux répliques réclament la même ligne, une seule gagne.
   */
  async claimForAutoResume(id: string): Promise<boolean> {
    const result = await this.jobs.update(
      { id, status: 'queued' },
      { status: 'running', auto_resumes: () => 'auto_resumes + 1' },
    )
    return (result.affected ?? 0) > 0
  }

  /**
   * #3236 (lot W2) — la reprise automatique s'arrête, pour une raison NOMMÉE. `unknown`, jamais `failed` :
   * un arrêt n'est pas un échec. Seules les lignes non terminales sont touchées.
   */
  async stop(id: string, reason: ChatDeepenStopReason): Promise<boolean> {
    const result = await this.jobs.update(
      { id, status: In(NON_TERMINAL_STATUSES) },
      { status: 'unknown', stopped_reason: reason },
    )
    return (result.affected ?? 0) > 0
  }

  async getLatestForConversation(userId: string, conversationId: string): Promise<ChatDeepenJobEntity | null> {
    const job = await this.jobs.findOne({
      where: { user_id: userId, conversation_id: conversationId },
      order: { updated_at: 'DESC' },
    })
    return job ?? null
  }

  /**
   * GA-76 : SANS verrou, par choix écrit — même raison que `StuckAnalysisReaper`.
   * La transition est gardée par la clause `WHERE` (`status IN (...)`), pas par
   * Redis : deux répliques qui balaient au même instant ne font chacune avancer
   * que les lignes que l'autre n'a pas déjà basculées, et aucune n'écrit deux
   * fois le même `unknown`. Un verrou singleton ne protégerait rien de plus
   * qu'une UPDATE idempotente ne protège déjà.
   */
  async markStaleBefore(cutoff: Date): Promise<number> {
    const result = await this.jobs.update(
      { status: In(NON_TERMINAL_STATUSES), updated_at: LessThan(cutoff) },
      { status: 'unknown' },
    )
    return result.affected ?? 0
  }
}
