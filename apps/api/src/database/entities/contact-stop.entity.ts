import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Le refus d'une personne — « ne me contactez plus ».
 *
 * En AJOUT SEUL : un arrêt ne se retire pas, il s'archive avec sa date, sa
 * raison et l'auteur du geste. C'est ce qu'il faut pouvoir montrer le jour où la
 * personne demande ce qu'on sait d'elle.
 *
 * `declared_by` est nullable et le reste : un désabonnement arrive du serveur de
 * messagerie, aucun humain de l'espace ne l'a posé. Écrire un identifiant de
 * complaisance attribuerait le geste à quelqu'un qui ne l'a pas fait.
 */
@Entity({ name: 'contact_stops' })
export class ContactStopEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  workspace_id: string

  @Index({ unique: true })
  @Column('uuid')
  contact_id: string

  /** Une valeur de `CONTACT_STOP_REASONS`, tenue par `contact_stops_reason_check`. */
  @Column('text')
  reason: string

  /** La motion au terme de laquelle l'issue a été déclarée. NULL pour un arrêt
   *  venu du transport (désabonnement, rebond), qui n'est l'issue de rien. */
  @Column('text', { nullable: true })
  motion: string | null

  /** L'issue déclarée, telle que le catalogue la nomme. NULL pour le transport. */
  @Column('text', { nullable: true })
  outcome: string | null

  /** Ce que le commercial a noté. NULL quand il n'a rien dit — jamais une
   *  phrase de remplissage. */
  @Column('text', { nullable: true })
  note: string | null

  /** L'auteur du geste. NULL = le transport, pas un humain. */
  @Column('uuid', { nullable: true })
  declared_by: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
