import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2261.13 (décision Louis 19/09) — UNE synchronisation réelle, gardée pour
 * mesurer la latence probable d'un outil connecté sur les 7 derniers jours
 * (`tool-latency.ts::measureToolLatency`).
 *
 * `source_at` (l'horodatage que l'API de l'outil FOURNIT) et `arrived_at`
 * (l'instant où Bellum l'a lu) — le délai entre les deux, moyenné sur les
 * lignes récentes de l'espace, EST la mesure. Jamais une valeur de doc,
 * jamais une moyenne inventée : sans lignes suffisantes, le registre répond
 * « non mesuré » avec sa raison (`ConnectedTool.latency`, `@bellum/contracts`).
 *
 * Même maille que `connector_capability_probes` (espace + fournisseur), même
 * absence de RLS : la table n'est jamais lue directement par un utilisateur,
 * seul `ToolRegistryService` l'agrège, côté service-role.
 */
export class ToolLatencyObservations1789809054644 implements MigrationInterface {
  name = 'ToolLatencyObservations1789809054644'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS tool_latency_observations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        provider text NOT NULL,
        source_at timestamptz NOT NULL,
        arrived_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    // La lecture du registre : les lignes d'un (espace, fournisseur) sur les 7
    // derniers jours, la plus récente d'abord.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS tool_latency_observations_workspace_provider_idx
        ON tool_latency_observations (workspace_id, provider, arrived_at DESC)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS tool_latency_observations`)
  }
}
