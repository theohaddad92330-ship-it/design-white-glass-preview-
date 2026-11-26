import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * #3719.4 — où et quand un contact a été exporté vers un CRM. Une ligne par
 * (contact, destination) : ré-exporter MET À JOUR la ligne. Voir la migration
 * `ContactCrmExports` pour la raison (table dédiée, pas une activité : un export
 * n'est pas un échange). `provider` est un identifiant interne, jamais affiché.
 */
@Entity({ name: 'contact_crm_exports' })
@Index(['contact_id', 'provider'], { unique: true })
export class ContactCrmExportEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  contact_id: string

  /** hubspot | salesforce | pipedrive | attio — jamais affiché. */
  @Column('text')
  provider: string

  @Column('text')
  crm_record_id: string

  /** created | updated — ce que le DERNIER geste a fait. */
  @Column('text')
  last_action: string

  /** Le nom de l'espace CRM de l'utilisateur (son `accountLabel`), jamais l'éditeur. */
  @Column('text', { nullable: true })
  destination_label: string | null

  @Column('uuid', { nullable: true })
  exported_by: string | null

  @CreateDateColumn({ type: 'timestamptz', name: 'exported_at' })
  exported_at: Date
}
