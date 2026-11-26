import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * #4158.22 — la liste « ne pas contacter » de l'ESPACE : un contact OU un
 * domaine, un motif obligatoire, l'auteur. En AJOUT SEUL : retirer pose
 * `lifted_at` / `lifted_by`, la ligne reste.
 *
 * Distincte de `contact_stops` (refus d'une personne) et de l'effacement RGPD.
 */
@Entity({ name: 'workspace_do_not_contact' })
export class WorkspaceDoNotContactEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  workspace_id: string

  @Column('text')
  kind: 'contact' | 'domain'

  @Column('uuid', { nullable: true })
  contact_id: string | null

  @Column('text', { nullable: true })
  domain: string | null

  @Column('text')
  reason: string

  @Column('uuid')
  added_by: string

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @Column('timestamptz', { nullable: true })
  lifted_at: Date | null

  @Column('uuid', { nullable: true })
  lifted_by: string | null
}
