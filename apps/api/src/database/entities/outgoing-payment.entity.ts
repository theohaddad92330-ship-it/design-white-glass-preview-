import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * Le paiement SORTANT vers le consultant (31/08/2026) — le miroir de
 * `InvoiceReadinessEntity`, qui suit l'argent qui RENTRE du client.
 *
 * Table à part, comme `supplier_invoices` et `mission_expenses` : réservée à
 * `finance:read` / `finance:write`, et une donnée dont l'accès diffère du reste
 * de la fiche se protège mal quand elle vit dans la même ligne.
 *
 * ⚠️ **Aucune colonne bancaire, et il n'y en aura pas.** Bellum SUIT le
 * paiement, il ne le déclenche pas — « Bellum ne signe rien, ne paie rien et ne
 * stocke aucun IBAN » (`admin-docs.ts`, la migration
 * `1788900000005-AdminDocsConnections`, le catalogue d'outils du copilote).
 * `paid_on` est ce qu'un humain CONSTATE.
 *
 * ⚠️ **Colonne créée = colonne DÉCLARÉE.** Les dix-neuf colonnes de la
 * migration `1790978000001` sont toutes ici : une colonne qui existe en base et
 * pas dans l'entité est une colonne que rien ne lit ni n'écrit — le défaut
 * « colonne lue jamais écrite », dans son autre sens.
 */
@Entity({ name: 'outgoing_payments' })
@Index(['workspace_id', 'period_month'])
export class OutgoingPaymentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  mission_id: string

  /** Le consultant payé. `null` sur une mission sans affectation lisible : le
   *  mois existe quand même, et le taire le ferait disparaître de l'écran. */
  @Column('uuid', { nullable: true })
  consultant_id: string | null

  /** Mois couvert, au premier du mois. */
  @Column('date')
  period_month: string

  /** La facture ENTRANTE qui justifie ce paiement. `ON DELETE SET NULL` : une
   *  facture supprimée ne fait pas disparaître le paiement — elle le rend
   *  injustifié, ce que l'écran NOMME. */
  @Column('uuid', { nullable: true })
  supplier_invoice_id: string | null

  /**
   * Ce qu'on doit, en centimes. NULLABLE, et c'est la décision : un montant
   * qu'on ne connaît pas vaut `null`, jamais `0` — la contrainte SQL refuse
   * d'ailleurs `0` et les négatifs, un décaissement de 0 € n'étant pas un
   * paiement.
   */
  @Column('bigint', { nullable: true })
  amount_cents: string | number | null

  /** Ce qui est réellement SORTI. Distinct du dû ci-dessus, et l'écart EST
   *  l'information — exactement comme entre `invoiced_amount_cents` et
   *  `paid_amount_cents` sur la facturation client. */
  @Column('bigint', { nullable: true })
  settled_amount_cents: string | number | null

  /** `non_genere` | `a_valider` | `valide` | `paye` | `rejete` — le cycle du
   *  contrat `OUTGOING_PAYMENT_STATUSES`, tenu par sa contrainte SQL. */
  @Column('text', { default: 'non_genere' })
  status: string

  /** La date à laquelle le paiement DEVAIT partir. Sans elle, aucun retard
   *  n'est calculable, et l'écran le nomme au lieu d'en inventer une. */
  @Column('date', { nullable: true })
  scheduled_on: string | null

  /** Quand l'argent est parti, CONSTATÉ par un humain. Obligatoire dès que
   *  l'état est `paye` — la contrainte SQL le tient. */
  @Column('date', { nullable: true })
  paid_on: string | null

  /** Combien de relances ont été CONSIGNÉES. `0` est ici une VRAIE valeur. */
  @Column('integer', { default: 0 })
  reminders_sent: number

  @Column('timestamptz', { nullable: true })
  last_reminder_at: Date | null

  @Column('timestamptz', { nullable: true })
  validated_at: Date | null

  /** Qui a ASSUMÉ le paiement. Le clic EST la décision, et elle porte un nom. */
  @Column('uuid', { nullable: true })
  validated_by: string | null

  @Column('timestamptz', { nullable: true })
  rejected_at: Date | null

  /** Le motif du rejet — jamais vide quand l'état est `rejete`, et c'est la
   *  BASE qui le tient, pas seulement le formulaire. */
  @Column('text', { nullable: true })
  rejection_reason: string | null

  /** Qui a créé la ligne — immuable, posé à la génération. */
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
