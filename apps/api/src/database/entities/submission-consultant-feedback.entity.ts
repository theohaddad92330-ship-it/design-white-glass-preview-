import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * #2335.5 — le retour du CONSULTANT, sur huit axes qui lui sont propres.
 * Table SÉPARÉE de `SubmissionFeedbackEntity` (retour client) : les deux
 * feedbacks ne se mélangent jamais, ni en base ni à l'écran.
 */
@Entity({ name: 'submission_consultant_feedback' })
@Index(['submission_id', 'created_at'])
export class SubmissionConsultantFeedbackEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  submission_id: string

  @Column('uuid', { nullable: true })
  workspace_id: string | null

  @Column('text', { default: 'unknown' })
  interest: string

  @Column('text', { default: 'unknown' })
  understanding: string

  @Column('text', { default: 'unknown' })
  manager: string

  @Column('text', { default: 'unknown' })
  mission: string

  @Column('text', { default: 'unknown' })
  conditions: string

  @Column('text', { default: 'unknown' })
  concerns: string

  @Column('text', { default: 'unknown' })
  availability: string

  @Column('text', { default: 'unknown' })
  decision: string

  @Column('text', { nullable: true })
  verbatim: string | null

  @Column('uuid', { nullable: true })
  recorded_by: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
