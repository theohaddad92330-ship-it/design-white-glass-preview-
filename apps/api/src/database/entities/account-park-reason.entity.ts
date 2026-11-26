import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Le catalogue de motifs d'écartement d'un compte (PDF 2 §4.4 B2).
 *
 * Même patron que `loss_reasons` : par ESPACE, éditable, et jamais supprimé
 * quand il sert — les raisons de dire non d'une ESN cyber ne sont pas celles
 * d'une ESN data, et un motif effacé emporte avec lui l'explication de tous les
 * comptes qui le portaient.
 */
@Entity('account_park_reasons')
@Index(['workspace_id'])
export class AccountParkReasonEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('text')
  label: string

  @Column('boolean', { default: false })
  archived: boolean

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
