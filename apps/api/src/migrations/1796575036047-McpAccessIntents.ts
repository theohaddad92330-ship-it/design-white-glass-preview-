import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Théo D settings-outils.N1 — « Cadre d'un nouvel accès » (Accès assistants / MCP).
 *
 * Table neuve : l'INTENTION d'un membre de brancher un assistant (un nom, un périmètre « mes dossiers » ou « dossiers
 * partagés »), validée ou refusée par un administrateur. Elle ne porte aucun jeton et aucun droit d'écriture : le jeton
 * naît à la connexion de l'assistant, par le consentement habituel.
 *
 * Les contraintes de valeurs sont posées ICI, avant le code qui les écrit (GA-11/12) : trois statuts, deux périmètres.
 */
export class McpAccessIntents1796575036047 implements MigrationInterface {
  public name = 'McpAccessIntents1796575036047'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS mcp_access_intents (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        requested_by uuid NOT NULL,
        name text NOT NULL,
        perimeter text NOT NULL,
        status text NOT NULL DEFAULT 'pending',
        decided_by uuid,
        decided_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT mcp_access_intents_status_check CHECK (status IN ('pending', 'approved', 'declined')),
        CONSTRAINT mcp_access_intents_perimeter_check CHECK (perimeter IN ('mine', 'shared')),
        CONSTRAINT mcp_access_intents_name_check CHECK (char_length(name) BETWEEN 1 AND 80)
      )
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_mcp_access_intents_workspace
        ON mcp_access_intents (workspace_id, status, created_at DESC)
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
