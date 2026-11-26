import { Column, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * L'état de facturabilité d'un mois de mission.
 *
 * La table ne porte AUCUNE facture — ni numéro, ni TVA, ni montant dû, ni
 * échéance. Elle porte ce qui EMPÊCHE de facturer, et le fait qu'un mois est
 * sorti de la surveillance parce que quelqu'un l'a facturé dans son outil
 * comptable.
 */
@Entity({ name: 'invoice_readiness' })
@Index(['mission_id', 'period_month'], { unique: true })
export class InvoiceReadinessEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  mission_id: string

  /** Mois couvert, au premier du mois. */
  @Column('date')
  period_month: string

  @Column('text', { default: 'blocked' })
  state: string

  /** Les bloqueurs VUS au moment de la dernière évaluation — ce qu'il faut
   *  pouvoir relire quand le client dit « personne ne m'a rien demandé ». */
  @Column('jsonb', { default: () => "'[]'::jsonb" })
  blockers: string[]

  /** Montant PRÉPARATOIRE en centimes. Ni un dû, ni une facture. */
  @Column('bigint', { nullable: true })
  prepared_amount_cents: string | number | null

  /** Référence de la facture réellement émise (« Marquer comme facturé »). */
  @Column('text', { nullable: true })
  invoice_reference: string | null

  @Column('timestamptz', { nullable: true })
  invoiced_at: Date | null

  @Column('uuid', { nullable: true })
  invoiced_by: string | null

  /**
   * ⚠️ Les six colonnes qui suivent existent depuis la migration
   * `1789693128476` et n'étaient déclarées par AUCUNE entité — GA-36 restait
   * verte parce que son analyseur ne lisait que la première colonne d'un
   * `ALTER TABLE` multi-colonnes. C'est ainsi que `paid_at` a pu être lu par le
   * chiffre d'affaires encaissé et par le délai de paiement sans qu'aucun champ
   * ne le porte, ni aucun chemin ne l'écrive.
   */

  /** Le montant RÉELLEMENT facturé, tel que l'outil comptable l'a émis. Il peut
   *  différer du préparatoire — et c'est cet écart qui est l'information. */
  @Column('bigint', { nullable: true })
  invoiced_amount_cents: string | number | null

  /** L'échéance de la facture. `null` = inconnue, jamais « aujourd'hui » : un
   *  retard se calcule depuis une date réelle ou ne se calcule pas. */
  @Column('date', { nullable: true })
  due_on: string | null

  /** Quand le client a payé. Écrit par « Enregistrer le paiement », et par
   *  rien d'autre — c'est ce qui rend le CA encaissé et le délai de paiement
   *  mesurables. */
  @Column('timestamptz', { nullable: true })
  paid_at: Date | null

  /** Ce qui a été payé, qui n'est pas toujours ce qui a été facturé. */
  @Column('bigint', { nullable: true })
  paid_amount_cents: string | number | null

  /**
   * Une facture CONTESTÉE : les relances s'arrêtent, mais la ligne reste.
   *
   * ⚠️ Écrites par PERSONNE jusqu'au 27/08/2026 — l'effet ci-dessus était
   * décrit ici et implémenté nulle part, si bien qu'un litige se gérait en
   * annulant le « facturé », ce qui remettait le mois dans les relances.
   * Le motif est obligatoire en base (`invoice_dispute_reason_check`).
   */
  @Column('timestamptz', { nullable: true })
  disputed_at: Date | null

  @Column('text', { nullable: true })
  dispute_reason: string | null

  /** Quand le litige a été LEVÉ. On n'efface jamais `disputed_at` : « cette
   *  facture a été contestée » reste vrai, et c'est ce qui explique le délai. */
  @Column('timestamptz', { nullable: true })
  dispute_resolved_at: Date | null

  /**
   * L'annulation d'un « marqué comme facturé ».
   *
   * On n'EFFACE pas la marque : `invoiced_at` repasse à `null` mais ces trois
   * colonnes gardent la trace. « Une facture a été annoncée puis retirée, pour
   * cette raison, par cette personne » est exactement ce qu'il faut pouvoir
   * relire six mois plus tard — et une contrainte SQL refuse une annulation
   * sans motif.
   */
  @Column('timestamptz', { nullable: true })
  invoice_cancelled_at: Date | null

  @Column('text', { nullable: true })
  invoice_cancelled_reason: string | null

  @Column('uuid', { nullable: true })
  invoice_cancelled_by: string | null

  @Column('integer', { default: 0 })
  reminders_sent: number

  @Column('timestamptz', { nullable: true })
  last_reminder_at: Date | null

  /**
   * #2419.8 — la preuve de connecteur d'une relance, quand il y en a une.
   * TOUJOURS `null` aujourd'hui (migration `InvoiceReadinessReminderMessageId`,
   * additive) : aucun connecteur de messagerie n'atteint cet écran, donc rien
   * ne l'écrit — une relance reste un geste DÉCLARATIF humain (doctrine
   * `c31_relance_encaissement`, « Fait ne porte jamais de preuve d'envoi »)
   * tant qu'aucune capacité d'envoi n'est ouverte ici.
   */
  @Column('text', { nullable: true })
  last_reminder_message_id: string | null

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
