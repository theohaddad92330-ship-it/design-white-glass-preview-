import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { CreditReservationState } from '@bellum/contracts'

/**
 * Une RÉSERVATION de crédits — le chaînon manquant entre « je vais dépenser » et
 * « j'ai dépensé ».
 *
 * Deux comportements coexistaient jusqu'ici, mauvais l'un comme l'autre : débiter
 * d'abord et rembourser sur échec (le solde ment pendant l'appel, et le
 * remboursement peut échouer à son tour), ou débiter à la fin (le run découvre à
 * l'arrivée que le solde est vide, après avoir déjà écrit ailleurs). Réserver
 * rend le solde exact À TOUT INSTANT, y compris pendant un run qui touche vingt
 * contacts.
 *
 * `expires_at` est ce qui empêche une réservation orpheline (process tué,
 * déploiement en plein run) de geler des crédits pour toujours : passé le délai,
 * elle est libérée d'office.
 */
@Entity({ name: 'credit_reservations' })
@Index(['workspace_id', 'state'])
export class CreditReservationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  user_id: string

  /** `analysis` ou `enrichment` — les deux compteurs réellement débités. */
  @Column('text')
  kind: string

  @Column('integer')
  amount: number

  @Index()
  @Column('text')
  state: CreditReservationState

  /** Le run ou l'action que cette réservation couvre. */
  @Index()
  @Column('text')
  reference: string

  @Column('timestamptz')
  expires_at: Date

  @Column('timestamptz', { nullable: true })
  settled_at: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
