import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm'

/**
 * Le canal SMS des alertes urgentes d'UNE personne — #1938.4, décision Louis
 * 13/09 batch 13. Migration `1792800210000-NotificationSmsChannel`.
 *
 * ⚠️ DONNÉE PERSONNELLE. Le numéro se lit par son seul propriétaire
 * (`SmsChannelService`, borné à `user_id` ; RLS en défense en profondeur), il
 * n'entre jamais dans un journal, il figure dans l'export RGPD
 * (`PrivacyExportService`) et la ligne est SUPPRIMÉE à l'effacement du compte
 * (`PrivacyDeletionService`).
 *
 * Une ligne n'existe qu'après une demande de code : c'est le seul chemin par
 * lequel un numéro entre. Tant qu'aucun fournisseur n'est branché, ce chemin est
 * fermé, et la table reste vide en production.
 */
@Entity({ name: 'notification_sms_channels' })
export class NotificationSmsChannelEntity {
  @PrimaryColumn('uuid')
  user_id: string

  /** Le numéro saisi, au format E.164 (contrainte SQL). */
  @Column('text')
  phone_e164: string

  /** Quand la personne a saisi le bon code. `null` = jamais vérifié, donc
   *  jamais destinataire d'une alerte. */
  @Column('timestamptz', { nullable: true })
  phone_verified_at: Date | null

  /** Le dernier geste de consentement (un type coché). `null` dès que plus
   *  aucun type ne l'est. */
  @Column('timestamptz', { nullable: true })
  consent_at: Date | null

  /** Opt-in par type d'alerte urgente — jamais coché par défaut. */
  @Column('boolean', { default: false })
  sms_buy_signal: boolean

  @Column('boolean', { default: false })
  sms_credit_low: boolean

  @Column('boolean', { default: false })
  sms_action_overdue: boolean

  /** L'EMPREINTE du code en attente, jamais le code. Un secret : il ne sort
   *  ni dans les réglages rendus, ni dans l'export. */
  @Column('text', { nullable: true })
  verification_code_hash: string | null

  @Column('timestamptz', { nullable: true })
  verification_expires_at: Date | null

  /** Quand le dernier code est parti — la minute d'attente entre deux codes
   *  se lit ici. */
  @Column('timestamptz', { nullable: true })
  verification_sent_at: Date | null

  @Column('integer', { default: 0 })
  verification_attempts: number

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
