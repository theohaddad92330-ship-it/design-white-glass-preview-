import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * #2927 — UN contact PERSONNEL : visible de son seul propriétaire. Table à part de `contacts` à dessein (raison
 * complète : migration `1796426312345-PersonalContacts`) — aucun lecteur de `contacts` ne peut donc le montrer.
 * Les colonnes reprennent les valeurs à plat que le planificateur d'import écrit pour un contact.
 */
@Entity({ name: 'personal_contacts' })
@Index(['workspace_id', 'user_id', 'account_id'])
export class PersonalContactEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  /** Le PROPRIÉTAIRE — la clé de portée de cette table (RLS : `auth.uid() = user_id`). */
  @Column('uuid')
  user_id: string

  @Column('uuid')
  account_id: string

  @Column('text')
  full_name: string

  @Column('text', { nullable: true })
  title: string | null

  @Column('text', { nullable: true })
  email: string | null

  @Column('text', { nullable: true })
  phone: string | null

  @Column('text', { nullable: true })
  linkedin_url: string | null

  @Column('text', { array: true, default: () => "'{}'" })
  tags: string[]

  @Column('text', { nullable: true })
  family: string | null

  @Column('integer', { nullable: true })
  priority: number | null

  @Column('text', { nullable: true })
  source: string | null

  @Column('text', { nullable: true })
  lifecycle_state: string | null

  @Column('jsonb', { default: () => "'{}'" })
  extra: Record<string, string>

  /** Posé quand le propriétaire a PARTAGÉ ce contact avec l'équipe : la ligne est archivée, jamais supprimée. */
  @Column('timestamptz', { nullable: true })
  promoted_at: Date | null

  /** La fiche d'équipe née du partage (ou la fiche déjà là, quand l'e-mail existait). */
  @Column('uuid', { nullable: true })
  promoted_contact_id: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
