import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `outreach_message_variables` — #3419.1 (épopée #2947, lot E07 04/10/2026).
 *
 * Chaque variable d'une VERSION de message porte sa valeur, sa source, sa
 * date, sa confiance et son autorisation d'usage externe. Migration ADDITIVE :
 * `outreach_message_versions` garde son `body` libre, rien n'est réécrit.
 *
 * Une variable par (message, version, nom) : la re-déclarer la met à jour. La
 * version suivante du message repart sans annotation (append-only, on ne
 * recopie pas un fait sur un texte que personne n'a relu). Le message supprimé
 * emporte ses annotations (CASCADE).
 */
export class OutreachMessageVariables1796430140701 implements MigrationInterface {
  public name = 'OutreachMessageVariables1796430140701'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS outreach_message_variables (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        message_id uuid NOT NULL REFERENCES outreach_messages(id) ON DELETE CASCADE,
        version integer NOT NULL,
        name text NOT NULL,
        value text NOT NULL,
        source text NOT NULL,
        as_of date NOT NULL,
        confidence text NOT NULL,
        external_use text NOT NULL,
        declared_by uuid NOT NULL,
        declared_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT outreach_message_variables_unique UNIQUE (message_id, version, name),
        CONSTRAINT outreach_message_variables_version_positive CHECK (version > 0),
        CONSTRAINT outreach_message_variables_confidence_check CHECK (confidence IN ('confirmed', 'probable', 'unverified')),
        CONSTRAINT outreach_message_variables_external_use_check CHECK (external_use IN ('allowed', 'forbidden', 'unknown'))
      )
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_outreach_message_variables_message
        ON outreach_message_variables (message_id, version)
    `)
    await queryRunner.query(`ALTER TABLE outreach_message_variables ENABLE ROW LEVEL SECURITY`)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
