import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Qui était sur l'activité.
 *
 * Table à part et non colonne `jsonb` : la question posée est « tous les
 * échanges où Marie apparaît », et un tableau JSON ne sait pas y répondre sans
 * index dédié. Le `handle` (adresse ou numéro) est conservé même quand aucun
 * contact ne correspond — c'est justement à ce moment-là qu'on cherche qui c'est.
 */
@Entity({ name: 'activity_participants' })
@Index(['activity_id'])
export class ActivityParticipantEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  activity_id: string

  @Column('text')
  handle: string

  @Column('text', { nullable: true })
  display_name: string | null

  @Index()
  @Column('uuid', { nullable: true })
  contact_id: string | null

  /** L'utilisateur de l'espace — ni un client, ni un prospect. */
  @Column('boolean', { default: false })
  is_self: boolean
}
