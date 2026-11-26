import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * Une ligne du BARÈME KILOMÉTRIQUE, SAISIE par l'ESN (31/08/2026).
 *
 * La table naît VIDE, à dessein : un barème par puissance fiscale pré-rempli —
 * recopié de mémoire, non daté, jamais revérifié — serait une donnée fictive
 * présentée comme une règle officielle, et l'ESN rembourserait dessus en croyant
 * appliquer le texte. Tant que rien n'est saisi, une ligne `mileage` reste NON
 * VÉRIFIÉE, jamais « conforme ».
 *
 * `effective_from` est OBLIGATOIRE ici alors qu'il est nullable sur
 * `expense_policy_caps` : là-bas, des plafonds existaient avant la date d'effet
 * et il aurait fallu leur en inventer une ; ici, toute ligne naît d'une saisie.
 */
@Entity({ name: 'expense_mileage_rates' })
export class ExpenseMileageRateEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  policy_id: string

  @Index()
  @Column('uuid')
  workspace_id: string

  /** La puissance fiscale du VÉHICULE — bornée à 50 CV par la contrainte SQL. */
  @Column('int')
  fiscal_horsepower: number

  /** Centimes par kilomètre, strictement positif. */
  @Column('bigint')
  cents_per_km: string | number

  /** Depuis quand ce tarif s'applique — un barème kilométrique se révise. */
  @Column('date')
  effective_from: string

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
