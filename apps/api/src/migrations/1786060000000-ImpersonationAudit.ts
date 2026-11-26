import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Audit trail for the admin "impersonate a user" feature.
 *
 * Append-only: `start`/`stop`/`refused` rows record who impersonated whom, when,
 * why, from where, and until when the token was valid. A `start` is committed
 * BEFORE the token is minted, so no impersonation session can exist untraced.
 */
export class ImpersonationAudit1786060000000 implements MigrationInterface {
  public name = 'ImpersonationAudit1786060000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS impersonation_audit (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        jti uuid NOT NULL,
        impersonator_actor text NOT NULL,
        target_user_id uuid NOT NULL,
        target_email text,
        reason text NOT NULL,
        action text NOT NULL,
        ip text,
        correlation_id text,
        expires_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT impersonation_audit_action_check CHECK (action IN ('start', 'stop', 'refused'))
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS impersonation_audit_target_idx ON impersonation_audit (target_user_id, created_at)`,
    )
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS impersonation_audit_jti_idx ON impersonation_audit (jti)`)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
