import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { CommercialOutcomeType } from '@bellum/contracts'

/**
 * Le ledger APPEND-ONLY des outcomes commerciaux — voir la migration
 * `1796321374213-CommercialOutcomes` pour la raison complète (épopée #2787).
 * Aucune colonne `updated_at` : cette ligne ne se met jamais à jour.
 */
@Entity({ name: 'commercial_outcomes' })
@Index(['workspace_id', 'account_id'])
export class CommercialOutcomeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Index()
  @Column('uuid')
  account_id: string

  @Index()
  @Column('uuid', { nullable: true })
  contact_id: string | null

  @Column('text')
  outcome_type: CommercialOutcomeType

  @Column('text', { nullable: true })
  reason: string | null

  @Column('uuid')
  recorded_by: string

  @CreateDateColumn({ type: 'timestamptz' })
  recorded_at: Date

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
