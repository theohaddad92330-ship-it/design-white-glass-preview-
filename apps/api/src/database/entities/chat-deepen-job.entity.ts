import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm'

export type ChatDeepenJobStatus = 'queued' | 'running' | 'done' | 'unknown'

/** #3236 (lot W2) — pourquoi la reprise automatique s'est ARRÊTÉE : toujours nommé, jamais un silence. */
export type ChatDeepenStopReason = 'credit_ceiling' | 'max_resumes' | 'resume_failed'

/**
 * #3236.2 (b, tranche) — une ligne par approfondissement interrompu, mise à
 * jour en place par la même personne et conversation. Voir la migration
 * `1796437700001-ChatDeepenJobs` pour la raison : `conversation_summaries.
 * thread_state` ne tient pas un point de reprise lisible après rechargement.
 */
@Entity({ name: 'chat_deepen_jobs' })
export class ChatDeepenJobEntity {
  @PrimaryColumn('text')
  id: string

  @Column('text')
  user_id: string

  @Column('text')
  conversation_id: string

  /** La question d'origine, tronquée — même borne que `current_job` côté IA (`CURRENT_JOB_MAX`). */
  @Column('text')
  label: string

  @Column('text', { default: 'queued' })
  status: ChatDeepenJobStatus

  @Column('integer', { default: 0 })
  completed_steps: number

  @Column('text', { nullable: true })
  current_step: string | null

  /** #3236 (lot W2) — combien de fois le job a repris tout seul en fond. */
  @Column('integer', { default: 0 })
  auto_resumes: number

  /** #3236 (lot W2) — la raison NOMMÉE de l'arrêt de la reprise automatique ; `null` tant qu'elle n'est pas arrêtée. */
  @Column('text', { nullable: true })
  stopped_reason: ChatDeepenStopReason | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
