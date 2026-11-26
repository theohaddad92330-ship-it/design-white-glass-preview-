import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Un entretien client sur un positionnement.
 *
 * `outcome` vaut `pending` par défaut : l'absence de verdict n'est pas un échec,
 * et ranger un entretien à venir dans « négatif » fausserait tout comptage.
 */
@Entity({ name: 'interviews' })
@Index(['submission_id', 'scheduled_at'])
export class InterviewEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  submission_id: string

  @Column('uuid', { nullable: true })
  workspace_id: string | null

  @Column('timestamptz')
  scheduled_at: Date

  @Column('text', { default: 'remote' })
  mode: string

  @Column('text', { array: true, default: () => "'{}'" })
  client_attendees: string[]

  @Column('text', { default: 'pending' })
  outcome: string

  @Column('text', { nullable: true })
  notes: string | null

  /**
   * #2875/#3398 (BM) — posée à la première ouverture du brief d'entretien
   * (`InterviewBriefDialog`), jamais recalculée après coup. `null` = jamais
   * ouvert — c'est ce que lit le signal « entretien à préparer ».
   */
  @Column('timestamptz', { nullable: true })
  brief_viewed_at: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
