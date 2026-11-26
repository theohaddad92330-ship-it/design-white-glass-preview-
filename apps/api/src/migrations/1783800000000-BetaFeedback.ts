import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `beta_feedback` — retour utilisateur pendant la beta 3-ESN (plan §4/§6, P2B).
 * One row per submission, keyed by `user_id`, optionally attached to an
 * `account_id`. On submit the API also opens a GitHub issue (env-gated) and
 * stores its number/url here; the dashboard-manager reads this table via an
 * internal endpoint. Rich context (page url, user agent, buffered console logs,
 * an optional screenshot data URL) is captured so a bug is reproducible without
 * a back-and-forth. RLS scopes rows to their author. Migration owned here
 * (NestJS = owner of métier tables).
 */
export class BetaFeedback1783800000000 implements MigrationInterface {
  public name = 'BetaFeedback1783800000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS beta_feedback (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
        category TEXT NOT NULL CHECK (category IN ('bug', 'metier', 'autre')),
        message TEXT NOT NULL,
        user_email TEXT,
        page_url TEXT,
        user_agent TEXT,
        console_logs TEXT,
        screenshot TEXT,
        github_issue_number INTEGER,
        github_issue_url TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)

    await queryRunner.query(`ALTER TABLE beta_feedback ENABLE ROW LEVEL SECURITY`)

    await queryRunner.query(`
      CREATE POLICY "Users can manage their own beta feedback"
        ON beta_feedback
        FOR ALL
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id)
    `)

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS beta_feedback_created_idx ON beta_feedback (created_at DESC)`)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
