import type { ImpersonationReasonCode } from '@bellum/contracts'
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/** One row per impersonation lifecycle event. `start`/`stop` bracket a session
 *  (correlated by `jti`); `refused` records a blocked attempt (protected user). */
export type ImpersonationAction = 'start' | 'stop' | 'refused'

/**
 * Append-only audit trail for the admin "impersonate a user" feature — WHO
 * impersonated WHOM, WHEN, WHY (reason), from which IP / correlation id, and until
 * when the token was valid. Non-negotiable: a `start` is only issued once its
 * audit row is committed (see ImpersonationService), so no impersonation token
 * exists without a trace. Never stores the token itself.
 */
@Entity({ name: 'impersonation_audit' })
@Index('impersonation_audit_target_idx', ['target_user_id', 'created_at'])
@Index('impersonation_audit_jti_idx', ['jti'])
export class ImpersonationAuditEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  /** JWT id (`jti`) of the impersonation token — correlates `start` ↔ `stop`. */
  @Column('uuid')
  jti: string

  /** Operator attribution label (the DM basic-auth username, authenticated by the
   *  internal secret). The product has no per-admin user accounts, so this is the
   *  acting-admin identity carried in the token's `act` claim. */
  @Column('text')
  impersonator_actor: string

  @Column('uuid')
  target_user_id: string

  @Column('text', { nullable: true })
  target_email: string | null

  /**
   * Le LIBELLÉ lisible du motif — ce que lit un humain qui ouvre le journal sans
   * connaître le catalogue, et la colonne sur laquelle six mois de lignes
   * historiques sont déjà écrites.
   */
  @Column('text')
  reason: string

  /**
   * Le motif en CODE de catalogue (#1670) — c'est lui qui se compte et se filtre.
   *
   * ⚠️ NULLABLE, et il le restera. Les lignes antérieures au catalogue portent
   * un motif en texte libre dont aucune règle ne peut déduire le code : leur en
   * donner un serait inventer une donnée. Un fait qu'on n'a pas reste inconnu.
   * Les lignes neuves en portent toujours un — c'est le DTO qui l'exige.
   */
  @Column('text', { nullable: true })
  reason_code: ImpersonationReasonCode | null

  /** LUDOVIC-D LC.10 — la précision libre et FACULTATIVE du motif (≤ 300, contrainte SQL). */
  @Column('text', { nullable: true })
  reason_detail: string | null

  @Column('text')
  action: ImpersonationAction

  /**
   * LUDOVIC-D LC.10 — sur une ligne `stop` : QUI a terminé quand ce n'est pas l'opérateur lui-même
   * (un admin depuis la console /impersonations). `null` = arrêt par l'opérateur.
   */
  @Column('text', { nullable: true })
  ended_by: string | null

  @Column('text', { nullable: true })
  ip: string | null

  @Column('text', { nullable: true })
  correlation_id: string | null

  /** When the token expires (start rows only). */
  @Column('timestamptz', { nullable: true })
  expires_at: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
