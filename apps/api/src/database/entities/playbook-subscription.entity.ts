import { Column, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * L'abonnement d'un espace à un playbook de niveau 5 — et son bouton d'arrêt.
 *
 * `enabled` vaut FAUX par défaut : rien ne part tant qu'un humain n'a pas armé,
 * et un seul `UPDATE` éteint tout.
 */
@Entity({ name: 'playbook_subscriptions' })
@Index(['workspace_id', 'playbook'], { unique: true })
export class PlaybookSubscriptionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('text')
  playbook: string

  @Column('boolean', { default: false })
  enabled: boolean

  @Column('integer', { default: 7 })
  silence_days: number

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
