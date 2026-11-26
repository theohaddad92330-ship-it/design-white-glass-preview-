import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * UNE CESSION DE CRÉANCE (31/08/2026).
 *
 * Elle pointe la créance par sa CLÉ — `mission_id` + `period_month`, celle de
 * `invoice_readiness` — et jamais par un document : Bellum n'émet aucune
 * facture, et en recréer une référence ici ferait un second numéro à côté de
 * celui de l'outil comptable.
 *
 * ⚠️ `commission_rate_bps` NULLABLE porte une DÉCISION : `null` = « le taux du
 * contrat s'applique », une valeur = un taux dérogatoire négocié sur cette
 * créance-là. Recopier le taux du contrat à la création aurait effacé la
 * différence, et le jour où le contrat change, plus personne ne saurait quel
 * taux couvrait quoi. La dérivation vit à UN seul endroit :
 * `effectiveCommissionRateBps` (@bellum/contracts).
 */
@Entity({ name: 'receivable_assignments' })
@Index(['mission_id', 'period_month'])
export class ReceivableAssignmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  contract_id: string

  @Column('uuid')
  mission_id: string

  /** Le mois de la créance cédée, au premier du mois. */
  @Column('date')
  period_month: string

  /** `prepared` | `assigned` | `settled` | `rejected` | `recalled` — le
   *  vocabulaire de `RECEIVABLE_ASSIGNMENT_STATES` (@bellum/contracts), tenu
   *  par `receivable_assignments_status_check`. */
  @Column('text', { default: 'prepared' })
  status: string

  /** Le montant CÉDÉ, en centimes. `null` = non saisi — l'écran le DIRA
   *  plutôt que d'afficher « 0 € cédé ». */
  @Column('bigint', { nullable: true })
  assigned_amount_cents: string | number | null

  /** Le taux DÉROGATOIRE de cette cession, en points de base. `null` = celui
   *  du contrat. Voir le bloc d'entête. */
  @Column('integer', { nullable: true })
  commission_rate_bps: number | null

  /** Quand la créance a été TRANSMISE au factor. Bellum ne transmet rien : un
   *  humain le fait, et ce champ consigne qu'il l'a fait. */
  @Column('date', { nullable: true })
  assigned_on: string | null

  @Column('date', { nullable: true })
  settled_on: string | null

  /**
   * Pourquoi le factor a REFUSÉ ou REPRIS la créance, dans les mots de celui
   * qui l'a lu.
   *
   * OBLIGATOIRE dès que le statut est `rejected` ou `recalled` — et la
   * contrainte SQL le tient aussi, pas seulement le contrat zod : « le factor
   * a refusé » sans rien d'autre ne se relit pas six mois plus tard, quand on
   * cherchera pourquoi cette créance est restée à la charge de l'ESN.
   */
  @Column('text', { nullable: true })
  decision_reason: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
