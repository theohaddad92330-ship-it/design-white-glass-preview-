import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * Une ligne de frais rattachée à une mission (30/08/2026).
 *
 * Table à part, comme `mission_commercial_terms` : réservée à `finance:read`,
 * une donnée dont l'accès diffère du reste de la fiche se protège mal quand
 * elle vit dans la même ligne.
 */
@Entity({ name: 'mission_expenses' })
@Index(['mission_id', 'expense_date'])
export class MissionExpenseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  mission_id: string

  @Index()
  @Column('uuid')
  workspace_id: string

  @Column('text')
  label: string

  /** Centimes, toujours strictement positif — la contrainte SQL le garantit. */
  @Column('bigint')
  amount_cents: string | number

  @Column('date')
  expense_date: string

  /** Qui l'a SAISIE — immuable, posé à la création. */
  @Column('uuid')
  entered_by: string

  /** `human` | `connector` | `pipeline` | `model` — le vocabulaire de
   *  `FIELD_SOURCES` (@bellum/contracts), pas un second axe inventé. */
  @Column('text', { default: 'human' })
  source: string

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
