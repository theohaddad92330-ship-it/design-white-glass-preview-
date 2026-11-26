import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * La politique de remboursement des frais, PAR CLIENT (31/08/2026).
 *
 * `account_id IS NULL` désigne la politique par DÉFAUT de l'espace — le
 * « barème interne » de la maquette ; non nulle, c'est celle négociée avec ce
 * client-là, qui l'emporte.
 *
 * Deux index UNIQUES PARTIELS tiennent cette dualité côté base : `UNIQUE
 * (workspace_id, account_id)` seul ne dédoublonne pas les lignes nulles dans
 * Postgres, et deux politiques par défaut coexisteraient — le service en
 * choisirait une selon l'ordre de lecture.
 */
@Entity({ name: 'expense_policies' })
export class ExpensePolicyEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  workspace_id: string

  /** `null` = la politique par DÉFAUT de l'espace. */
  @Column('uuid', { nullable: true })
  account_id: string | null

  @Column('text')
  label: string

  /** `actual` (au réel) | `scale` (au barème). */
  @Column('text', { default: 'actual' })
  reimbursement_basis: string

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
