import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Adds a nullable ``siren`` column to ``accounts``.
 *
 * The Pappers SIREN (9-digit French company identifier) rides in the Phase-1
 * research overlay; persisting it on the account lets the per-company result
 * cache (StepC C1) key on a stable id instead of the free-text company name.
 * Nullable because non-French companies / legacy rows have no SIREN.
 *
 * A partial index on ``(user_id, siren)`` (rows with a SIREN) accelerates the
 * cache lookup — it's always scoped by ``user_id`` for tenant safety.
 */
export class AddSirenToAccounts1780000000008 implements MigrationInterface {
  public name = 'AddSirenToAccounts1780000000008'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS siren TEXT`)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_accounts_user_siren ON accounts (user_id, siren) WHERE siren IS NOT NULL`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_accounts_user_siren`)
    await queryRunner.query(`ALTER TABLE accounts DROP COLUMN IF EXISTS siren`)
  }
}
