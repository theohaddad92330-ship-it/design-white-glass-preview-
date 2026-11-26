import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4737 — Le mandat d'envoi LinkedIn et son journal.
 *
 * Deux tables neuves, donc aucune contrainte à élargir avant du code existant
 * (GA-11 / GA-12) : les CHECK naissent avec les tables.
 *  - `linkedin_mandates` : qui donne, quand, borne par jour, période, révocation.
 *  - `linkedin_send_log` : chaque geste d'envoi, refusé ou non. `body` est le
 *    corps du message — stocké, jamais exposé. `proof_ref` n'existe que pour un
 *    envoi vérifié (`sent`).
 */
export class LinkedInMandates1796590123457 implements MigrationInterface {
  public name = 'LinkedInMandates1796590123457'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS linkedin_mandates (
        id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        user_id      uuid NOT NULL,
        granted_at   timestamptz NOT NULL DEFAULT now(),
        valid_from   timestamptz NOT NULL,
        valid_until  timestamptz NOT NULL,
        daily_limit  integer NOT NULL,
        revoked_at   timestamptz,
        created_at   timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT linkedin_mandates_daily_limit_check CHECK (daily_limit BETWEEN 1 AND 50),
        CONSTRAINT linkedin_mandates_period_check CHECK (valid_until > valid_from)
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS linkedin_mandates_workspace_idx ON linkedin_mandates (workspace_id)`,
    )
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS linkedin_send_log (
        id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        user_id      uuid NOT NULL,
        mandate_id   uuid,
        contact_id   uuid NOT NULL,
        status       text NOT NULL,
        reason       text,
        body         text,
        proof_ref    text,
        created_at   timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT linkedin_send_log_status_check CHECK (
          status IN ('refused', 'not_open', 'sent', 'failed', 'unknown')
        ),
        CONSTRAINT linkedin_send_log_proof_only_when_sent CHECK (proof_ref IS NULL OR status = 'sent')
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS linkedin_send_log_workspace_idx ON linkedin_send_log (workspace_id)`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS linkedin_send_log_mandate_idx ON linkedin_send_log (mandate_id)`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS linkedin_send_log_contact_idx ON linkedin_send_log (contact_id)`,
    )
    for (const table of ['linkedin_mandates', 'linkedin_send_log']) {
      await queryRunner.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`)
      await queryRunner.query(`
        DO $$ BEGIN
          CREATE POLICY ${table}_owner ON ${table}
            USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
        EXCEPTION WHEN duplicate_object THEN NULL; END $$
      `)
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS linkedin_send_log`)
    await queryRunner.query(`DROP TABLE IF EXISTS linkedin_mandates`)
  }
}
