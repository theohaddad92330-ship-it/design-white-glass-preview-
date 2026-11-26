import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * #2875 (#2402.3) — la MÉMOIRE de transition de `contacts.decision_role`,
 * alimentée par un trigger SQL (migration `1796413205629`), jamais écrite à la
 * main : un écrivain oublié serait un silence. `emitted_at` est posé par le
 * balayage qui émet `changement_decideur` au registre canonique.
 */
@Entity({ name: 'contact_decision_role_history' })
export class ContactDecisionRoleHistoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  contact_id: string

  @Column('uuid', { nullable: true })
  workspace_id: string | null

  @Column('uuid', { nullable: true })
  account_id: string | null

  @Column('text', { nullable: true })
  from_role: string | null

  @Column('text', { nullable: true })
  to_role: string | null

  @Column('timestamptz', { default: () => 'now()' })
  changed_at: Date

  @Column('timestamptz', { nullable: true })
  emitted_at: Date | null
}
