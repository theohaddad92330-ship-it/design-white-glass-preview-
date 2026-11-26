import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2445.12 (épopée #2766) — le journal de TRANSITIONS que
 * `connector_capability_probes` n'a jamais tenu (elle n'écrit que la
 * DERNIÈRE observation). Additive, ne touche aucune table existante.
 */
export class ConnectorCapabilityIncidents1796344355019 implements MigrationInterface {
  name = 'ConnectorCapabilityIncidents1796344355019'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS connector_capability_incidents (
        id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        provider     text NOT NULL,
        capability   text NOT NULL,
        transition   text NOT NULL,
        error_code   text,
        occurred_at  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT connector_capability_incidents_transition_check CHECK (transition IN ('degraded', 'recovered'))
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS ix_connector_capability_incidents_occurred_at ON connector_capability_incidents (occurred_at DESC)`,
    )
    await queryRunner.query(`ALTER TABLE connector_capability_incidents ENABLE ROW LEVEL SECURITY`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS connector_capability_incidents`)
  }
}
