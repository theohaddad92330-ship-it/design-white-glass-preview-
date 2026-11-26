import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm'

/**
 * #4427.2 — un contact poussé dans une campagne Lemlist. Porte l'identifiant du
 * lead rendu par Lemlist, sans lequel ses statuts ne se relisent pas (#4427.3).
 */
@Entity({ name: 'lemlist_lead_pushes' })
@Unique('lemlist_lead_pushes_unique', ['workspace_id', 'contact_id', 'campaign_id'])
export class LemlistLeadPushEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  contact_id: string

  @Column('uuid')
  pushed_by: string

  @Column('text')
  campaign_id: string

  @Column('text', { nullable: true })
  campaign_name: string | null

  /** `null` = Lemlist n'a pas rendu d'identifiant (doublon refusé) : statuts non relisables. */
  @Column('text', { nullable: true })
  lead_id: string | null

  /** #4427.3 — le DERNIER statut relu chez Lemlist (une ligne par statut, datée) ; `null` = jamais relu. */
  @Column('jsonb', { nullable: true })
  last_statuses: Array<{ status: string; at: string | null }> | null

  /** #4427.3 — quand `last_statuses` a été relu : la date de la preuve. */
  @Column('timestamptz', { nullable: true })
  statuses_read_at: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
