import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * Une NOTE DE FRAIS — le dossier soumis par une personne pour une période
 * (31/08/2026).
 *
 * À ne pas confondre avec `MissionExpenseEntity` (`mission_expenses`), qui est
 * la LIGNE DE FRAIS d'une mission : une colonne de coût qui corrige la marge.
 * Ni avec `SupplierInvoiceEntity`, qui est ce qu'on doit à une SOCIÉTÉ.
 *
 * Chaque colonne de la migration `1790970000001` est déclarée ici — c'est ce
 * que vérifie GA-36 dès qu'un `ALTER TABLE … ADD COLUMN` viendra s'y ajouter.
 */
@Entity({ name: 'expense_reports' })
@Index(['workspace_id', 'period_month'])
export class ExpenseReportEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  workspace_id: string

  /** La mission que ces frais servent — `null` quand la note n'en porte pas. */
  @Column('uuid', { nullable: true })
  mission_id: string | null

  /** Le CLIENT, pour appliquer sa politique de frais. */
  @Column('uuid', { nullable: true })
  account_id: string | null

  /** Le PORTEUR de la note. Le livrable le DÉSIGNE : exception d'identité. */
  @Column('text')
  bearer_name: string

  /** Le porteur, quand c'est un membre de l'espace — sinon `null`. */
  @Column('uuid', { nullable: true })
  bearer_user_id: string | null

  /** Unique dans l'espace (`expense_reports_workspace_reference_key`). */
  @Column('text')
  reference: string

  /** `AAAA-MM`, vérifié par `expense_reports_period_month_check`. */
  @Column('text')
  period_month: string

  /** `pending` | `validated` | `rejected` | `draft` — jamais un cinquième sans
   *  migration. `draft` a été ajouté EN FIN le 31/08/2026, quand le chemin de
   *  dépôt a existé (`1791005000001-ExpenseReportDraftStatus`). */
  @Column('text', { default: 'pending' })
  status: string

  /**
   * Quand la note a été DÉPOSÉE — un fait, pas la date de la ligne : elle ne
   * passe pas par `@CreateDateColumn`, qui n'existe qu'une fois par entité.
   *
   * `null` sur un BROUILLON, et sur lui seul
   * (`expense_reports_submitted_at_check`) : une note jamais soumise n'a pas de
   * date de dépôt, et en inventer une afficherait un fait faux.
   */
  @Column('timestamptz', { nullable: true })
  submitted_at: Date | null

  @Column('timestamptz', { nullable: true })
  decided_at: Date | null

  @Column('uuid', { nullable: true })
  decided_by: string | null

  /** Exigé par la base dès que `status = 'rejected'` — le dernier rempart. */
  @Column('text', { nullable: true })
  rejection_reason: string | null

  /**
   * La ligne `mission_expenses` engendrée par la validation.
   *
   * C'est la PREUVE que la marge a reçu ces frais, et une seule fois : le
   * service refuse d'en écrire une seconde quand elle est renseignée. Sans
   * elle, valider deux fois compterait les frais deux fois dans la marge.
   */
  @Column('uuid', { nullable: true })
  mission_expense_id: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
