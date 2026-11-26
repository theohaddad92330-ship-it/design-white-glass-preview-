import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * L'objectif mensuel de marge d'un espace — le réglage que l'anneau « Taux de
 * réalisation » compare (D7 du 26/08, levé le 31/08/2026).
 *
 * Une ligne PAR MOIS, jamais une colonne sur l'espace : un objectif révisé en
 * mars ne doit pas réécrire ce qu'on s'était fixé en février. Voir la migration
 * `1790982000001-FinanceMarginTargets` pour le raisonnement complet.
 *
 * ⚠️ `target_percent` est un `numeric` : le pilote pg le remonte en CHAÎNE.
 * Toute lecture passe donc par un `Number(...)` explicite — c'est le service qui
 * le fait, une fois, et jamais l'écran.
 */
@Entity({ name: 'finance_margin_targets' })
@Index('finance_margin_targets_workspace_month_idx', ['workspace_id', 'month'], { unique: true })
export class FinanceMarginTargetEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  /** Le mois visé, `AAAA-MM`. Borné par une contrainte `CHECK` en base. */
  @Column('text')
  month: string

  /** Le taux de marge visé, en pourcentage. Strictement positif, ≤ 100. */
  @Column('numeric', { precision: 5, scale: 2 })
  target_percent: string

  /** Qui l'a saisi. `uuid` nu : un membre parti ne bloque pas le ménage. */
  @Column('uuid', { nullable: true })
  set_by: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
