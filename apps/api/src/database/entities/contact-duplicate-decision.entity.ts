import { Column, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm'

/**
 * #4114.4 — la décision humaine sur une paire de personnes proposée comme doublon.
 * `same` = confirmation (la porte de fusion s'ouvre, rien n'est fusionné ici) ; `not_same` = la paire ne revient plus.
 * Ordre normalisé : `left_contact_id < right_contact_id`.
 */
@Entity({ name: 'contact_duplicate_decisions' })
@Unique('contact_duplicate_decisions_pair', ['workspace_id', 'left_contact_id', 'right_contact_id'])
export class ContactDuplicateDecisionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Index()
  @Column('uuid')
  account_id: string

  @Column('uuid')
  left_contact_id: string

  @Column('uuid')
  right_contact_id: string

  @Column('text')
  decision: 'same' | 'not_same'

  @Column('uuid')
  user_id: string

  @Column('timestamptz', { default: () => 'now()' })
  decided_at: Date
}
