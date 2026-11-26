import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Audit fixes (April 2026): backfills missing indexes, re-asserts RLS on every
 * table, recreates RLS policies idempotently, adds columns that legacy schemas
 * may be missing, and documents tables in Supabase Studio.
 *
 * Idempotent — safe to re-run on already-aligned schemas.
 */
export class AuditFixes1776067200000 implements MigrationInterface {
  public name = 'AuditFixes1776067200000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─── Indexes — user_id lookups (RLS + app queries) ───────────────────
    for (const [table] of [
      ['accounts'],
      ['contacts'],
      ['attack_angles'],
      ['action_plans'],
      ['rag_documents'],
      ['user_credits'],
      ['profiles'],
    ] as const) {
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_${table}_user_id ON ${table}(user_id)`)
    }

    // ─── Indexes — account_id joins ──────────────────────────────────────
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_contacts_account_id ON contacts(account_id)`)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_attack_angles_account_id ON attack_angles(account_id)`)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_action_plans_account_id ON action_plans(account_id)`)

    // ─── Indexes — sorting ───────────────────────────────────────────────
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_accounts_created_at ON accounts(created_at DESC)`)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_accounts_priority_score ON accounts(priority_score DESC NULLS LAST)`,
    )
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_contacts_priority ON contacts(priority ASC NULLS LAST)`)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_contacts_created_at ON contacts(created_at DESC)`)

    // ─── Indexes — status filtering ──────────────────────────────────────
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_accounts_status ON accounts(status)`)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_contacts_user_status ON contacts(user_status)`)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_contacts_decision_role ON contacts(decision_role)`)

    // ─── Indexes — composite ─────────────────────────────────────────────
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_accounts_user_status ON accounts(user_id, status)`)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_contacts_account_user ON contacts(account_id, user_id)`)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_attack_angles_account_user ON attack_angles(account_id, user_id)`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_action_plans_account_user ON action_plans(account_id, user_id)`,
    )

    // ─── Re-assert RLS on every table (no-op if already enabled) ────────
    const tables = [
      'accounts',
      'contacts',
      'attack_angles',
      'action_plans',
      'profiles',
      'rag_documents',
      'user_credits',
    ]
    for (const t of tables) {
      await queryRunner.query(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`)
    }

    // ─── RLS policies — drop + recreate per (table, op) ─────────────────
    const ops = ['select', 'insert', 'update', 'delete'] as const
    for (const t of tables) {
      for (const op of ops) {
        await queryRunner.query(`DROP POLICY IF EXISTS "${t}_${op}" ON ${t}`)
        const clause = op === 'insert' ? 'WITH CHECK' : 'USING'
        await queryRunner.query(
          `CREATE POLICY "${t}_${op}" ON ${t} FOR ${op.toUpperCase()} ${clause} (auth.uid() = user_id)`,
        )
      }
    }

    // ─── Missing columns ─────────────────────────────────────────────────
    await queryRunner.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS error_message TEXT`)
    await queryRunner.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS user_context TEXT`)
    await queryRunner.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS api_cost_euros NUMERIC(10,4)`)
    await queryRunner.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false`)
    await queryRunner.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS raw_data JSONB`)
    await queryRunner.query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false`)
    await queryRunner.query(`ALTER TABLE user_credits ADD COLUMN IF NOT EXISTS enrichment_credits INTEGER DEFAULT 0`)
    await queryRunner.query(`ALTER TABLE user_credits ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT`)
    await queryRunner.query(`ALTER TABLE user_credits ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT`)

    // ─── Table documentation (Supabase Studio) ──────────────────────────
    await queryRunner.query(
      `COMMENT ON TABLE accounts IS 'Each analyzed company. Indexes: user_id, status, priority_score, created_at. RLS: auth.uid() = user_id'`,
    )
    await queryRunner.query(
      `COMMENT ON TABLE contacts IS 'Decision makers per account. Indexes: user_id, account_id, priority, user_status, decision_role. RLS: auth.uid() = user_id'`,
    )
    await queryRunner.query(
      `COMMENT ON TABLE attack_angles IS 'Strategic attack angles per account. Indexes: user_id, account_id. RLS: auth.uid() = user_id'`,
    )
    await queryRunner.query(
      `COMMENT ON TABLE action_plans IS 'Sequenced action plans per account. Indexes: user_id, account_id. RLS: auth.uid() = user_id'`,
    )
    await queryRunner.query(
      `COMMENT ON TABLE profiles IS 'User profile and onboarding data. RLS: auth.uid() = user_id'`,
    )
    await queryRunner.query(
      `COMMENT ON TABLE rag_documents IS 'RAG vector documents (pgvector 1536-dim). Indexes: user_id, ivfflat cosine. RLS: auth.uid() = user_id'`,
    )
    await queryRunner.query(
      `COMMENT ON TABLE user_credits IS 'Subscription plan and usage credits. RLS: auth.uid() = user_id'`,
    )
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
