import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * ⚠️ LEGACY TIMESTAMP COLLISION — this migration shares its 1783000000000
 * timestamp with `1783000000000-BackfillReconciledPriorityScore.ts`. Both
 * already ran in production and are recorded in the `_migrations` table under
 * their CURRENT class names.
 *
 * DO NOT rename this file or class: TypeORM matches executed migrations by
 * class name, so a renamed class would look pending and RE-RUN at the next
 * `migration:run` (verified on TypeORM 0.3.28 — the pending list is computed
 * before any migration executes, so no corrective migration can prevent it).
 *
 * On a fresh database the two may run in either load order (glob v10 does not
 * sort); they are functionally independent, so either order is safe. New
 * collisions are blocked by `src/database/migrations.spec.ts`.
 */
export class AddArchivedDeletedStatusesToAccounts1783000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_status_check`)
    await queryRunner.query(
      `ALTER TABLE accounts ADD CONSTRAINT accounts_status_check CHECK (status IN ('analyzing', 'completed', 'error', 'canceled', 'archived', 'deleted'))`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_status_check`)
    await queryRunner.query(
      `ALTER TABLE accounts ADD CONSTRAINT accounts_status_check CHECK (status IN ('analyzing', 'completed', 'error', 'canceled'))`,
    )
  }
}
