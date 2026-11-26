import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2439.15 — L'AUDIT DE CHAQUE EXPORT PERSONNEL (`PrivacyExportAuditLogEntity`).
 *
 * `GET /privacy/export` et `GET /privacy/export/object` n'écrivaient nulle
 * part : un export RGPD lit la totalité des données personnelles d'un
 * compte, sans qu'aucune trace ne dise qui, quoi, quand. Ligne d'audit =
 * jamais corrigée, même choix que `ai_tool_call_audit_log`
 * (`1795999346689-AiToolCallAuditLog.ts`) : aucun `updated_at`.
 */
export class PrivacyExportAuditLog1796321386200 implements MigrationInterface {
  public name = 'PrivacyExportAuditLog1796321386200'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS privacy_export_audit_log (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL,
        kind text NOT NULL,
        object_key text,
        format text,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT privacy_export_audit_log_kind_check CHECK (kind IN ('full', 'object'))
      )
    `)

    // « Qui a exporté quoi récemment ? » — les plus récents d'abord, par personne.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_privacy_export_audit_log_user
        ON privacy_export_audit_log (user_id, created_at DESC)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_privacy_export_audit_log_user`)
    await queryRunner.query(`DROP TABLE IF EXISTS privacy_export_audit_log`)
  }
}
