import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * Une entrée du BARÈME : le plafond d'une catégorie sous une politique, et le
 * droit à déduction de TVA de cette catégorie (31/08/2026).
 *
 * `cap_cents` NULLABLE porte toute la distinction : `null` = catégorie NON
 * PLAFONNÉE, donc ligne NON VÉRIFIÉE — jamais « conforme ». C'est ce qui
 * empêche un barème incomplet d'afficher « Conforme » sur une note dont la
 * moitié n'a été comparée à rien.
 *
 * `vat_recoverable` est une DONNÉE et non une règle codée : « l'hôtel n'ouvre
 * pas droit, le restaurant si » est national, daté, et bouge — codé en dur, il
 * serait faux au premier client étranger.
 */
@Entity({ name: 'expense_policy_caps' })
export class ExpensePolicyCapEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  policy_id: string

  @Index()
  @Column('uuid')
  workspace_id: string

  /** Une des douze catégories — `expense_policy_caps_category_check`. */
  @Column('text')
  category: string

  /** Centimes. `null` = catégorie non plafonnée, PAS « plafond zéro ». */
  @Column('bigint', { nullable: true })
  cap_cents: string | number | null

  /** La TVA de cette catégorie ouvre-t-elle droit à déduction ici ? */
  @Column('boolean', { default: true })
  vat_recoverable: boolean

  /**
   * La DATE D'EFFET du plafond. `null` = en vigueur depuis toujours.
   *
   * Sans elle, relever un plafond en septembre rendrait rétroactivement
   * conformes des notes de mars. Un verdict déjà rendu ne se réécrit pas parce
   * qu'une règle a changé depuis.
   */
  @Column('date', { nullable: true })
  effective_from: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
