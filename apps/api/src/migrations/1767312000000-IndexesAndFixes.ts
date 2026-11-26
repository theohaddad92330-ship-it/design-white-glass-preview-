import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Performance indexes for the most common query patterns:
 * - `user_id` lookups (RLS + application queries)
 * - sorting (created_at, priority_score, priority)
 * - status filtering (status, user_status, decision_role)
 * - composite indexes (user_id + status, account_id + user_id)
 */
export class IndexesAndFixes1767312000000 implements MigrationInterface {
  public name = 'IndexesAndFixes1767312000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // user_id lookups
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id)`)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts(user_id)`)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_contacts_account_id ON contacts(account_id)`)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_attack_angles_account_id ON attack_angles(account_id)`)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_action_plans_account_id ON action_plans(account_id)`)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_rag_documents_user_id ON rag_documents(user_id)`)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_user_credits_user_id ON user_credits(user_id)`)

    // Sorting
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_accounts_created_at ON accounts(created_at DESC)`)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_accounts_priority_score ON accounts(priority_score DESC NULLS LAST)`,
    )
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_contacts_priority ON contacts(priority ASC NULLS LAST)`)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_contacts_created_at ON contacts(created_at DESC)`)

    // Status filtering
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_accounts_status ON accounts(status)`)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_contacts_user_status ON contacts(user_status)`)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_contacts_decision_role ON contacts(decision_role)`)

    // Composite indexes for common query patterns
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_accounts_user_status ON accounts(user_id, status)`)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_contacts_account_user ON contacts(account_id, user_id)`)

    // Table comments
    await queryRunner.query(
      `COMMENT ON TABLE accounts IS 'Each analyzed company. Indexes: user_id, status, priority_score, created_at'`,
    )
    await queryRunner.query(
      `COMMENT ON TABLE contacts IS 'Decision makers. Indexes: user_id, account_id, priority, status, role'`,
    )
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
