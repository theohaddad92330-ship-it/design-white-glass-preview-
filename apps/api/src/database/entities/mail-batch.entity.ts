import type { MailBatchMode } from '@bellum/contracts'
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm'

/**
 * La trace d'un lot d'envoi — ce qui rend l'approbation idempotente.
 *
 * `batch_id` est fourni par le client et porte l'unicité : ré-approuver,
 * recharger la page ou rejouer la requête ne renvoie rien une seconde fois.
 * L'insertion précède les envois, comme pour les routines : rater un lot se
 * répare, un lot parti deux fois ne se rattrape pas.
 */
@Entity({ name: 'mail_send_batches' })
@Unique('mail_send_batches_batch', ['batch_id'])
export class MailBatchEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  user_id: string

  @Column('uuid')
  batch_id: string

  @Column('text')
  mode: MailBatchMode

  @Column('int', { default: 0 })
  requested: number

  @Column('int', { default: 0 })
  sent: number

  @Column('int', { default: 0 })
  drafted: number

  @Column('int', { default: 0 })
  skipped: number

  @Column('int', { default: 0 })
  failed: number

  /** Le lot a-t-il été interrompu par la règle des échecs consécutifs ? */
  @Column('boolean', { default: false })
  aborted: boolean

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
