import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2018.7/.8/.9 — SIGNALER une information d'entreprise fausse SANS l'écraser.
 *
 * Un membre sans `team:manage` (`profile:report` seul) ne peut jamais écrire
 * le profil canonique de son espace — `EsnProfileService.persistAnswers`
 * ignore déjà silencieusement ses éditions de champs ENTREPRISE. Cette table
 * porte le geste qui lui restait fermé : DIRE qu'une valeur est fausse, sans
 * jamais la toucher.
 *
 * ⚠️ Aucune colonne de « valeur proposée » : le contrat (`createEsnProfileCorrectionRequestSchema`)
 * est `.strict()` sur `field_key` + `reason` — signaler ne PROPOSE rien,
 * l'écriture reste le geste de qui en a le droit (doctrine « rien n'écrit
 * tout seul »).
 *
 * ⚠️ Les demandes TRANCHÉES restent : une décision est une trace, on archive,
 * on ne supprime pas — même patron que `1795560000000-WorkspaceJoinRequests`.
 *
 * ── RLS : un FILET, pas la serrure ──────────────────────────────────────────
 * L'API se connecte en superuser et contourne RLS : l'autorisation réelle vit
 * dans `EsnProfileCorrectionRequestService` (guardée par `@RequirePermission('profile:report')`
 * côté route). Les deux politiques protègent l'autre porte, un accès direct
 * avec un JWT Supabase : l'auteur lit SES demandes, les administrateurs de
 * l'espace (`team:manage` — owner/admin ici, sales_ops n'a pas de ligne
 * `workspace_members` distincte de son rôle) lisent celles de LEUR espace.
 * Aucune politique d'écriture — personne n'écrit ici en direct.
 */
export class EsnProfileCorrectionRequests1795670043127 implements MigrationInterface {
  name = 'EsnProfileCorrectionRequests1795670043127'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS esn_profile_correction_requests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
        reporter_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
        field_key text NOT NULL,
        reason text NOT NULL,
        status text NOT NULL DEFAULT 'pending',
        created_at timestamptz NOT NULL DEFAULT now(),
        resolved_at timestamptz,
        resolved_by uuid,
        CONSTRAINT esn_profile_correction_requests_status_check CHECK (status IN ('pending', 'resolved', 'dismissed'))
      )
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS esn_profile_correction_requests_workspace_idx
        ON esn_profile_correction_requests (workspace_id, status)
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS esn_profile_correction_requests_reporter_idx
        ON esn_profile_correction_requests (reporter_user_id, created_at DESC)
    `)

    await queryRunner.query(`ALTER TABLE esn_profile_correction_requests ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(
      `DROP POLICY IF EXISTS "esn_profile_correction_requests_reporter_read" ON esn_profile_correction_requests`,
    )
    await queryRunner.query(`
      CREATE POLICY "esn_profile_correction_requests_reporter_read" ON esn_profile_correction_requests FOR SELECT
        USING (reporter_user_id = auth.uid())
    `)
    await queryRunner.query(
      `DROP POLICY IF EXISTS "esn_profile_correction_requests_admin_read" ON esn_profile_correction_requests`,
    )
    await queryRunner.query(`
      CREATE POLICY "esn_profile_correction_requests_admin_read" ON esn_profile_correction_requests FOR SELECT
        USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS esn_profile_correction_requests`)
  }
}
