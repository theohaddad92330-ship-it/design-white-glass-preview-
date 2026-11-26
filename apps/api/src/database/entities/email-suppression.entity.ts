import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Opt-out / suppression list (Palier 1 « Envoie l'email » — garde-fou RGPD).
 * Before any outreach send, the address is checked here; an entry means the
 * contact unsubscribed (or bounced/complained) and must NOT be emailed again.
 * Scoped per workspace: an opt-out from one ESN's outreach doesn't affect another.
 */
@Entity({ name: 'email_suppressions' })
@Index('email_suppressions_ws_email_uq', ['workspace_id', 'email'], { unique: true })
export class EmailSuppressionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  // Always stored lower-cased (the service normalises before insert/lookup).
  // #2297.51 — for an ERASED person (RGPD art. 17), the HMAC fingerprint of the
  // address instead (64 hex chars, see `erased_at`); the send check reads both.
  @Column('text')
  email: string

  /**
   * #2297.51 — quand l'adresse d'une personne effacée a été remplacée par son
   * empreinte. NULL = opposition ordinaire, adresse en clair. La base refuse une
   * ligne effacée qui garderait une adresse en clair
   * (`email_suppressions_erased_form_check`, migration `1789816622437`).
   */
  @Column('timestamptz', { nullable: true })
  erased_at: Date | null

  // unsubscribe | bounce | complaint | manual
  @Column('text')
  reason: string

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
