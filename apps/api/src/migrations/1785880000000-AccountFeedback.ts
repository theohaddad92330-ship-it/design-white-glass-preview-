import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Boucle de feedback dossier (chantier A2) — `account_feedback` capture les
 * retours utilisateur STRUCTURÉS sur un dossier (« ce play est hors sujet »,
 * « ce contact n'est plus là », « bonne lecture ») :
 *
 * - append-only : jamais d'UPDATE — chaque retour est un fait daté, cité tel
 *   quel dans les directives de correction réinjectées aux runs suivants ;
 * - `target` / `verdict` = vocabulaires fermés (CHECK), alignés sur
 *   `@bellum/contracts` (`accountFeedbackTargetSchema` / `...VerdictSchema`) ;
 * - FK compte ON DELETE CASCADE : la suppression (RGPD) d'un compte emporte
 *   ses retours ; `workspace_id` = scope de lecture d'équipe (mémoire par
 *   compte/workspace), `user_id` = attribution created-by (JWT, jamais body).
 *
 * RLS activé avec la policy standard `auth.uid() = user_id` (mirror de
 * `memory_pinned_facts`) ; l'API service-role scope en plus par workspace.
 */
export class AccountFeedback1785880000000 implements MigrationInterface {
  public name = 'AccountFeedback1785880000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS account_feedback (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
        user_id uuid NOT NULL,
        target text NOT NULL CHECK (target IN ('play', 'contact', 'signal', 'section', 'global')),
        target_ref text NOT NULL DEFAULT '',
        verdict text NOT NULL CHECK (verdict IN ('utile', 'inutile', 'faux', 'obsolete')),
        note text,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS account_feedback_account_idx ON account_feedback (account_id, created_at)`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS account_feedback_workspace_idx ON account_feedback (workspace_id, created_at)`,
    )
    await queryRunner.query(`ALTER TABLE account_feedback ENABLE ROW LEVEL SECURITY`)
    // Postgres n'a pas CREATE POLICY IF NOT EXISTS — guard pg_policies (42710)
    // pour les re-runs / instances de release concurrentes (même pattern que
    // memory_pinned_facts).
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'account_feedback'
                         AND policyname = 'Users can manage their own account feedback') THEN
          CREATE POLICY "Users can manage their own account feedback"
            ON account_feedback FOR ALL
            USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
        END IF;
      END $$;
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
