import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2016 — LES DEMANDES D'ACCÈS À UN ESPACE EXISTANT (décision Louis 15/09/2026).
 *
 * Un nouveau venu dont le domaine professionnel correspond à un espace existant
 * DEMANDE l'accès au lieu de recréer l'entreprise. Il n'est pas membre : aucune
 * table existante ne peut porter sa demande (`workspace_invitations` va dans
 * l'autre sens, `business_unit_access_requests` suppose d'être déjà membre).
 *
 * ⚠️ Aucune coordonnée n'est copiée ici : l'adresse du demandeur se relit sur
 * son profil, au moment où un administrateur la regarde. Une copie vivrait
 * plus longtemps que le compte qu'elle décrit.
 *
 * ⚠️ Les demandes TRANCHÉES restent : une décision d'accès est une trace. Seule
 * la demande EN COURS est unique par personne et par espace.
 *
 * ── RLS : un FILET, pas la serrure ──────────────────────────────────────────
 * L'API se connecte en superuser et contourne RLS (voir
 * `1784600000001-WorkspaceRlsPolicies`) : l'autorisation réelle vit dans
 * `WorkspaceJoinService`. Les deux politiques protègent l'autre porte, un accès
 * direct avec un JWT Supabase : le demandeur lit SES demandes, les
 * administrateurs de l'espace lisent celles de LEUR espace. Aucune politique
 * d'écriture — personne n'écrit ici en direct.
 */
export class WorkspaceJoinRequests1795560000000 implements MigrationInterface {
  name = 'WorkspaceJoinRequests1795560000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS workspace_join_requests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
        status text NOT NULL DEFAULT 'pending',
        created_at timestamptz NOT NULL DEFAULT now(),
        decided_at timestamptz,
        decided_by uuid,
        CONSTRAINT workspace_join_requests_status_check CHECK (status IN ('pending', 'accepted', 'refused', 'dismissed'))
      )
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS workspace_join_requests_pending_unique
        ON workspace_join_requests (workspace_id, user_id) WHERE status = 'pending'
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS workspace_join_requests_user_idx
        ON workspace_join_requests (user_id, created_at DESC)
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS workspace_join_requests_workspace_idx
        ON workspace_join_requests (workspace_id, status)
    `)

    await queryRunner.query(`ALTER TABLE workspace_join_requests ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`DROP POLICY IF EXISTS "workspace_join_requests_requester_read" ON workspace_join_requests`)
    await queryRunner.query(`
      CREATE POLICY "workspace_join_requests_requester_read" ON workspace_join_requests FOR SELECT
        USING (user_id = auth.uid())
    `)
    await queryRunner.query(`DROP POLICY IF EXISTS "workspace_join_requests_admin_read" ON workspace_join_requests`)
    await queryRunner.query(`
      CREATE POLICY "workspace_join_requests_admin_read" ON workspace_join_requests FOR SELECT
        USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS workspace_join_requests`)
  }
}
