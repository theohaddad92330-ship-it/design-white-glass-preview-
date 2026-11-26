import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Email suppression / opt-out list (Palier 1 « Envoie l'email » — garde-fou
 * RGPD). Every unsubscribe (via the signed List-Unsubscribe link) inserts a row;
 * every outreach send checks it first. Scoped per workspace.
 *
 * SAFE : nouvelle table isolée, aucune dépendance FK dure (workspace_id en uuid
 * nu), aucun changement sur les tables existantes.
 */
export class EmailSuppressions1784901000000 implements MigrationInterface {
  public name = 'EmailSuppressions1784901000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS email_suppressions (
        id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        workspace_id uuid NOT NULL,
        email text NOT NULL,
        reason text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    // Email is always stored lower-cased by the service, so a plain unique index
    // on (workspace_id, email) is enough and lets INSERT ... ON CONFLICT DO NOTHING
    // stay idempotent.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS email_suppressions_ws_email_uq
      ON email_suppressions (workspace_id, email)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS email_suppressions_ws_email_uq`)
    await queryRunner.query(`DROP TABLE IF EXISTS email_suppressions`)
  }
}
