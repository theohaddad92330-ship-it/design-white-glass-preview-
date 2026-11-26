import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * SCOPES-I (18/10/2026) — une portée OAuth manquante ne passe plus inaperçue.
 *
 * AJOUT SEULEMENT : une table neuve, aucune colonne existante touchée. Une ligne par (utilisateur,
 * connecteur) dont le jeton porte moins de portées que l'app n'en demande ; elle disparaît quand
 * l'écart se referme. Contrainte NOMMÉE (GA-177), posée avant le code qui l'écrit (GA-11 / GA-12) :
 * `CONNECTOR_SCOPE_GAP_PROVIDERS`.
 */
export class ConnectorScopeGaps1796560471923 implements MigrationInterface {
  public name = 'ConnectorScopeGaps1796560471923'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS connector_scope_gaps (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL,
        workspace_id uuid,
        provider text NOT NULL,
        missing_scopes text NOT NULL,
        signature text NOT NULL,
        fresh_consent boolean NOT NULL DEFAULT false,
        notified_signature text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT connector_scope_gaps_provider_check CHECK (provider IN ('hubspot', 'salesforce', 'pipedrive', 'zoho', 'attio', 'google', 'microsoft'))
      )
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS connector_scope_gaps_user_provider_uidx
        ON connector_scope_gaps (user_id, provider)
    `)
    await queryRunner.query(`ALTER TABLE connector_scope_gaps ENABLE ROW LEVEL SECURITY`)
    // Lecture directe (hors API, qui passe par le rôle de service) : l'utilisateur concerné seulement.
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE POLICY connector_scope_gaps_read ON connector_scope_gaps FOR SELECT
          USING (user_id = auth.uid());
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS connector_scope_gaps`)
  }
}
