import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `config_overrides` — runtime overrides for the IA knowledge config (niveau 1,
 * Théo). One row per `scope` (`global` for now; per-ESN later) holding a JSONB
 * `patch` deep-merged over the shipped defaults (see
 * apps/ia/app/config/knowledge_config.py). Lets an operator tune a threshold
 * WITHOUT a redeploy: write the row → POST /config/reload on the IA.
 *
 * Operator/admin config, not user data → RLS on with NO user policy, so only the
 * service role (which bypasses RLS) can read/write it.
 */
export class ConfigOverrides1783500000000 implements MigrationInterface {
  public name = 'ConfigOverrides1783500000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS config_overrides (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        scope TEXT NOT NULL DEFAULT 'global',
        patch JSONB NOT NULL DEFAULT '{}',
        version TEXT,
        updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
        updated_at TIMESTAMPTZ DEFAULT now(),
        UNIQUE (scope)
      )
    `)

    // No user policy: RLS enabled but only the service role (bypass) may touch it.
    await queryRunner.query(`ALTER TABLE config_overrides ENABLE ROW LEVEL SECURITY`)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
