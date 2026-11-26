import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3446.10 — porteur persistant de la trace d'une production de Laura
 * (modèle + version, exemples injectés, règles, variables, preuves
 * manquantes, contrôles, décision finale). Les CHECK reprennent exactement
 * les valeurs écrites par `MessageLibraryService` (GA-11/GA-12), posées avant
 * le code. Journal en ajout seul ; aucun corps de message n'y est stocké.
 */
export class MessageLibraryTraces1796419034517 implements MigrationInterface {
  name = 'MessageLibraryTraces1796419034517'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS message_library_traces (
        id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id         uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
        user_id              uuid,
        kind                 text NOT NULL,
        entry_id             uuid,
        entry_version        integer,
        criteria             jsonb NOT NULL DEFAULT '{}'::jsonb,
        injected_example_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
        rules                jsonb NOT NULL DEFAULT '[]'::jsonb,
        variables            jsonb NOT NULL DEFAULT '[]'::jsonb,
        proofs_missing       jsonb NOT NULL DEFAULT '[]'::jsonb,
        checks               jsonb NOT NULL DEFAULT '[]'::jsonb,
        decision             text NOT NULL,
        created_at           timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT message_library_traces_kind_check CHECK (kind IN ('verbatim', 'inspiration')),
        CONSTRAINT message_library_traces_decision_check CHECK (decision IN (
          'template_selected', 'no_template', 'examples_injected', 'no_example'))
      )
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS ix_message_library_traces_workspace
        ON message_library_traces (workspace_id, created_at DESC)
    `)
    await queryRunner.query(`ALTER TABLE message_library_traces ENABLE ROW LEVEL SECURITY`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS message_library_traces`)
  }
}
