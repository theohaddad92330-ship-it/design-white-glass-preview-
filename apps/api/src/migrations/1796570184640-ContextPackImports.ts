import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4422.1 — l'HISTORIQUE des imports de l'assistant « Dépose tes documents » : postes cibles, grille go/no-go,
 * séquences, connaissances. Seuls les comptes passaient par un job universel, donc seuls eux apparaissaient dans
 * l'historique de /settings/import. Nouvelle table (ajout seul) : une ligne par fichier importé, avec son bilan.
 * Contraintes posées AVANT le code qui écrit (GA-11/GA-12) : destination, statut, compteurs ≥ 0.
 */
export class ContextPackImports1796570184640 implements MigrationInterface {
  public name = 'ContextPackImports1796570184640'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS context_pack_imports (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id  uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
        user_id       uuid NOT NULL,
        file_name     text NOT NULL,
        destination   text NOT NULL,
        status        text NOT NULL,
        imported      integer,
        skipped       integer NOT NULL DEFAULT 0,
        scripts       integer,
        message       text,
        created_at    timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT context_pack_imports_destination_check
          CHECK (destination IN ('target_personas', 'qualification_grid', 'sequences', 'knowledge')),
        CONSTRAINT context_pack_imports_status_check CHECK (status IN ('done', 'failed')),
        CONSTRAINT context_pack_imports_counts_check
          CHECK ((imported IS NULL OR imported >= 0) AND skipped >= 0 AND (scripts IS NULL OR scripts >= 0))
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS context_pack_imports_workspace_created_idx ON context_pack_imports (workspace_id, created_at DESC)`,
    )
    await queryRunner.query(`ALTER TABLE context_pack_imports ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`DROP POLICY IF EXISTS "context_pack_imports_own_workspace" ON context_pack_imports`)
    await queryRunner.query(`
      CREATE POLICY "context_pack_imports_own_workspace" ON context_pack_imports FOR SELECT
        USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS context_pack_imports`)
  }
}
