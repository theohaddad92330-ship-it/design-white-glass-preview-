import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * #2455.5 — trace qu'un contexte de travail a été activé pour une conversation.
 * La bascule ouvre une NOUVELLE conversation (le fil d'origine n'est jamais
 * réécrit) ; cette table ne fait que retenir quel contexte est actif pour
 * l'afficher, jamais une mutation d'un fil existant.
 */
@Entity({ name: 'work_context_activations' })
@Index('work_context_activations_user_idx', ['workspace_id', 'user_id', 'activated_at'])
export class WorkContextActivationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  work_context_id: string

  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  user_id: string

  @Column('text', { nullable: true })
  conversation_id: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  activated_at: Date
}
