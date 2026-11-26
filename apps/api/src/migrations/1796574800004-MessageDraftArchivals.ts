import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Théo B M2.R6 — « Archiver le brouillon » : on archive, on ne supprime pas.
 *
 * Une version de brouillon ne se corrige jamais ; l'archivage vit dans sa propre ligne d'audit (jamais un UPDATE de la
 * version) et ne porte aucun contenu. Une version neuve sur le même fil ramène le brouillon dans la liste.
 *
 * Table neuve, aucune contrainte de valeur énumérée : rien à élargir avant le code (GA-11/12).
 */
export class MessageDraftArchivals1796574800004 implements MigrationInterface {
  public name = 'MessageDraftArchivals1796574800004'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS message_draft_archivals (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        version_id uuid NOT NULL REFERENCES message_draft_versions (id) ON DELETE CASCADE,
        archived_by uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_message_draft_archivals_version
        ON message_draft_archivals (version_id)
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_message_draft_archivals_workspace
        ON message_draft_archivals (workspace_id, archived_by, created_at)
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
