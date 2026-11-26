import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * Une ligne du « Détail des frais » d'une note (31/08/2026).
 *
 * `vat_rate_bps` est NULLABLE et c'est la décision de cette table : `null` =
 * le ticket n'a pas été lu, `0` = taux zéro. Un défaut à 0 aurait confondu les
 * deux dès le premier jour, et la ventilation de TVA aurait affiché un total
 * qui a l'air complet sur des lignes jamais lues.
 *
 * La TVA récupérable N'EST PAS stockée : elle dérive du taux et de la politique
 * du client (`lineRecoverableVatCents`, @bellum/contracts). Une dérivation vit
 * à un seul endroit — stockée ici, elle deviendrait fausse à la première
 * correction du barème.
 */
@Entity({ name: 'expense_report_lines' })
@Index(['expense_report_id', 'spent_on'])
export class ExpenseReportLineEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  expense_report_id: string

  @Index()
  @Column('uuid')
  workspace_id: string

  /** Une des douze catégories — `expense_report_lines_category_check`. */
  @Column('text')
  category: string

  @Column('text')
  label: string

  @Column('date')
  spent_on: string

  /**
   * La ville portée par le justificatif. Exception NOMMÉE de la doctrine sur
   * les critères protégés : elle décrit une DÉPENSE, elle n'ordonne personne.
   */
  @Column('text', { nullable: true })
  city: string | null

  /** « 2e classe », « chambre simple » — ce que le ticket précise. */
  @Column('text', { nullable: true })
  detail: string | null

  /** Centimes TTC, strictement positif — la contrainte SQL le garantit. */
  @Column('bigint')
  amount_cents: string | number

  /** Points de base (2000 = 20 %). `null` = pas lu, jamais 0 par défaut. */
  @Column('int', { nullable: true })
  vat_rate_bps: number | null

  /**
   * Kilomètres parcourus — sur une ligne `mileage`, et sur elle seule.
   *
   * `null` sur les onze autres catégories : la question ne s'y pose pas, et
   * « 0 km » serait une mesure, donc une mesure fausse. `null` sur une ligne
   * kilométrique dont la distance n'a pas été saisie, aussi — et c'est ce qui
   * la laisse NON VÉRIFIÉE plutôt que conforme.
   */
  @Column('int', { nullable: true })
  distance_km: number | null

  /** La puissance fiscale du VÉHICULE, qui choisit le tarif au kilomètre. Elle
   *  décrit une voiture, elle n'ordonne aucune personne. */
  @Column('int', { nullable: true })
  fiscal_horsepower: number | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
