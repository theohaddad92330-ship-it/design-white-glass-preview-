import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4158.57 (décision Louis 17/10/2026, arrêt levé sous conditions) — RAPATRIER L'ESPACE PERSONNEL d'un
 * utilisateur dans l'espace ESN qu'il a rejoint.
 *
 * AJOUT SEULEMENT (condition d) : deux colonnes NULLables sur `workspaces`, deux tables neuves. Aucune
 * contrainte existante n'est touchée, aucune ligne n'est écrite ni supprimée.
 *
 *  · `workspaces.archived_at` / `merged_into_workspace_id` — l'espace personnel rapatrié est ARCHIVÉ,
 *    jamais supprimé (condition c) : ses lignes d'origine restent lisibles, et il nomme où elles sont parties.
 *  · `workspace_merge_requests` — la demande : l'APERÇU figé (`preview`) et son EMPREINTE (`preview_hash`),
 *    sur laquelle portent la validation de l'utilisateur puis celle d'un admin de l'espace cible
 *    (`workspace_id` = l'espace CIBLE, celui qui l'arbitre). Une seule demande vivante par espace personnel.
 *  · `workspace_merge_items` — le journal ligne à ligne du job : UNE ligne par (demande, table, ligne
 *    d'origine), c'est ce qui rend le déplacement idempotent et reprenable après coupure (condition e).
 *
 * Contraintes NOMMÉES (GA-177), posées AVANT le code qui les écrit (GA-11 / GA-12) :
 * `WORKSPACE_MERGE_STATUSES`, `WORKSPACE_MERGE_ITEM_OUTCOMES`, `WORKSPACE_MERGE_TABLES`.
 */
export class WorkspacePersonalMerge1796560255919 implements MigrationInterface {
  public name = 'WorkspacePersonalMerge1796560255919'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS archived_at timestamptz`)
    await queryRunner.query(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS merged_into_workspace_id uuid`)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS workspace_merge_requests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        source_workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        requested_by uuid NOT NULL,
        status text NOT NULL DEFAULT 'previewed',
        preview jsonb NOT NULL,
        preview_hash text NOT NULL,
        user_validated_at timestamptz,
        admin_validated_by uuid,
        admin_validated_at timestamptz,
        rejected_by uuid,
        rejected_at timestamptz,
        started_at timestamptz,
        finished_at timestamptz,
        last_error text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT workspace_merge_requests_status_check CHECK (status IN ('previewed', 'awaiting_admin', 'approved', 'running', 'done', 'failed', 'rejected', 'cancelled')),
        CONSTRAINT workspace_merge_requests_distinct_check CHECK (source_workspace_id <> workspace_id)
      )
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS workspace_merge_requests_target_status_idx
        ON workspace_merge_requests (workspace_id, status)
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS workspace_merge_requests_one_live_idx
        ON workspace_merge_requests (source_workspace_id)
        WHERE status IN ('previewed', 'awaiting_admin', 'approved', 'running', 'failed')
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS workspace_merge_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        request_id uuid NOT NULL REFERENCES workspace_merge_requests(id) ON DELETE CASCADE,
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        source_table text NOT NULL,
        source_id uuid NOT NULL,
        target_id uuid,
        outcome text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT workspace_merge_items_table_check CHECK (source_table IN ('accounts', 'contacts')),
        CONSTRAINT workspace_merge_items_outcome_check CHECK (outcome IN ('copied', 'duplicate_proposed', 'held_with_account')),
        CONSTRAINT workspace_merge_items_once UNIQUE (request_id, source_table, source_id)
      )
    `)

    await queryRunner.query(`ALTER TABLE workspace_merge_requests ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`ALTER TABLE workspace_merge_items ENABLE ROW LEVEL SECURITY`)
    // Lecture directe (hors API, qui passe par le rôle de service) : le demandeur, ou un admin de la cible.
    // Aucune politique d'écriture : seule l'API écrit.
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE POLICY workspace_merge_requests_read ON workspace_merge_requests FOR SELECT
          USING (
            requested_by = auth.uid()
            OR EXISTS (
              SELECT 1 FROM workspace_members m
               WHERE m.workspace_id = workspace_merge_requests.workspace_id
                 AND m.user_id = auth.uid()
                 AND m.role IN ('owner', 'admin')
            )
          );
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS workspace_merge_items`)
    await queryRunner.query(`DROP TABLE IF EXISTS workspace_merge_requests`)
    await queryRunner.query(`ALTER TABLE workspaces DROP COLUMN IF EXISTS merged_into_workspace_id`)
    await queryRunner.query(`ALTER TABLE workspaces DROP COLUMN IF EXISTS archived_at`)
  }
}
