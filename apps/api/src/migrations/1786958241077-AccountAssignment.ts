import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Account ownership — `accounts.assigned_to` (the "portefeuille").
 *
 * Théo's method makes the account a TEAM object with a named owner ("Ressources
 * à mobiliser : équipe dédiée (responsable compte, …)"). Until now an account
 * implicitly belonged to whoever typed the company name (`accounts.user_id`,
 * created-by attribution) — which is an attribution rule, not an assignment
 * rule, and matches how no ESN actually allocates its portfolio.
 *
 * Deliberately NOT backfilled from `user_id`. Every workspace today is
 * effectively single-member, so presuming "creator = owner" would silently
 * declare a full, fictitious allocation on day 1 and hide exactly the signal the
 * manager screen exists to show. `NULL` means "non attribué", which is the
 * honest starting state and the manager's to-assign queue.
 *
 * Nullable by design: releasing an account (`assigned_to = NULL`) is a supported
 * product gesture, not a data defect.
 */
export class AccountAssignment1786958241077 implements MigrationInterface {
  public name = 'AccountAssignment1786958241077'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS assigned_to uuid`)
    // Serves both reads the manager screen makes: the per-member portfolio
    // count, and the "unassigned" queue (`assigned_to IS NULL`) — both are
    // always workspace-scoped first.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS accounts_workspace_assigned_idx ON accounts (workspace_id, assigned_to)`,
    )
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
