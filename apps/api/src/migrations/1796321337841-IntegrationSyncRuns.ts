import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3014 — l'amorçage de la première synchronisation (`/integrations`).
 *
 * Une table neuve, `integration_sync_runs` : le déclenchement, l'attente et le
 * résumé décrits par l'épopée ont besoin d'un ÉVÉNEMENT daté et rejouable —
 * `ConnectedTool` (registre des outils) ne porte qu'un état courant, jamais
 * l'historique d'un lancement précis.
 *
 * `summary` est `NULL` tant que `status <> 'completed'` : un tableau vide s'y
 * confondrait avec « terminé, et rien trouvé sur aucun domaine » — la
 * distinction que la doctrine « on n'affiche pas ce qu'on n'a pas » exige.
 * `error_fr`/`error_en` sont NULL hors `status = 'failed'` : deux colonnes,
 * jamais un texte technique unique qu'il faudrait traduire à l'écran.
 *
 * GA-11/GA-12 — la contrainte CHECK sur `status` couvre les trois valeurs de
 * `SYNC_RUN_STATUSES` (`@bellum/contracts`) dès la création de la colonne.
 */
export class IntegrationSyncRuns1796321337841 implements MigrationInterface {
  name = 'IntegrationSyncRuns1796321337841'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS integration_sync_runs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        started_by uuid NOT NULL,
        provider text NOT NULL,
        status text NOT NULL DEFAULT 'running',
        summary jsonb NULL,
        error_fr text NULL,
        error_en text NULL,
        started_at timestamptz NOT NULL DEFAULT now(),
        finished_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT integration_sync_runs_status_check CHECK (status IN ('running', 'completed', 'failed'))
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS integration_sync_runs_workspace_idx ON integration_sync_runs (workspace_id, provider, started_at DESC)`,
    )
    await queryRunner.query(`ALTER TABLE integration_sync_runs ENABLE ROW LEVEL SECURITY`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS integration_sync_runs`)
  }
}
